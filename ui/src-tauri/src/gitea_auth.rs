//! Sign in to the company Gitea.
//!
//! Gitea is the OAuth2 provider here: Friday opens its authorize page in the browser (which hands
//! the person on to the company SSO), receives the code on a loopback port, and exchanges it with
//! PKCE. The tokens go to the OS credential store; the page only learns who is signed in.
//!
//! The OAuth2 application is registered once in Gitea (not confidential, redirect
//! `http://127.0.0.1:41830/callback`); its client ID is built in, so nobody has to set anything up.

use crate::gateway_auth::{random_b64, wait_for_code};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::net::TcpListener;

const SERVICE: &str = "friday";
const TOKEN_ENTRY: &str = "gitea-token";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
const REDIRECT_PORT: u16 = 41830;
/// The company's shared OAuth2 application for Friday (public client with PKCE, so this is not a
/// secret). A different one can be set with `FRIDAY_GITEA_CLIENT_ID` or in the app's saved settings.
const DEFAULT_CLIENT_ID: &str = "f42b9817-c036-471a-b284-9e5b98fd350a";

fn base_url() -> Result<String, String> {
    let url = std::env::var("FRIDAY_GITEA_URL").unwrap_or_else(|_| "https://git.digitalx.srt".into());
    let url = url.trim_end_matches('/').to_string();
    if url.starts_with("https://") { Ok(url) } else { Err("The Gitea URL must be https.".into()) }
}

fn redirect_uri() -> String {
    format!("http://127.0.0.1:{REDIRECT_PORT}/callback")
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GiteaStatus {
    /// The OAuth2 application's client ID is set, so sign-in can start.
    pub configured: bool,
    pub signed_in: bool,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Saved {
    client_id: Option<String>,
    username: Option<String>,
    display_name: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: Option<String>,
    /// Seconds since the Unix epoch.
    expires_at: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Deserialize)]
struct GiteaUser {
    login: Option<String>,
    full_name: Option<String>,
}

/// The client ID in use: environment, then a saved one, then the built-in default.
fn client_id(app: &AppHandle) -> String {
    std::env::var("FRIDAY_GITEA_CLIENT_ID")
        .ok()
        .or_else(|| read_saved(app).client_id)
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string())
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn saved_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("gitea.json"))
}

fn read_saved(app: &AppHandle) -> Saved {
    saved_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_saved(app: &AppHandle, saved: &Saved) -> Result<(), String> {
    std::fs::write(saved_path(app)?, serde_json::to_string(saved).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Windows keeps at most 2560 bytes per credential (about 1280 characters), and Gitea's tokens are long
/// JWTs, so the stored value is split over several credentials. The base entry holds the part count.
const CHUNK_CHARS: usize = 900;

fn slot(index: Option<usize>) -> Result<keyring::Entry, String> {
    let name = match index {
        Some(i) => format!("{TOKEN_ENTRY}.{i}"),
        None => TOKEN_ENTRY.to_string(),
    };
    keyring::Entry::new(SERVICE, &name).map_err(|e| e.to_string())
}

fn clear_tokens() {
    let parts = slot(None).ok().and_then(|e| e.get_password().ok()).and_then(|n| n.parse::<usize>().ok()).unwrap_or(0);
    for i in 0..parts {
        if let Ok(e) = slot(Some(i)) {
            let _ = e.delete_credential();
        }
    }
    if let Ok(e) = slot(None) {
        let _ = e.delete_credential();
    }
}

fn stored_tokens() -> Option<Tokens> {
    let parts: usize = slot(None).ok()?.get_password().ok()?.parse().ok()?;
    let mut text = String::new();
    for i in 0..parts {
        text.push_str(&slot(Some(i)).ok()?.get_password().ok()?);
    }
    serde_json::from_str(&text).ok()
}

fn store_tokens(tokens: &Tokens) -> Result<(), String> {
    let text = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    let chars: Vec<char> = text.chars().collect();
    let pieces: Vec<String> = chars.chunks(CHUNK_CHARS).map(|c| c.iter().collect()).collect();
    clear_tokens();
    let fail = |e: keyring::Error| format!("Could not save the Gitea token: {e}");
    for (i, piece) in pieces.iter().enumerate() {
        slot(Some(i))?.set_password(piece).map_err(fail)?;
    }
    slot(None)?.set_password(&pieces.len().to_string()).map_err(fail)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn tokens_from(response: TokenResponse, previous_refresh: Option<String>) -> Tokens {
    Tokens {
        access_token: response.access_token,
        refresh_token: response.refresh_token.or(previous_refresh),
        expires_at: now() + response.expires_in.unwrap_or(3600),
    }
}

/// A valid access token, refreshed first when it is about to expire. `None` when not signed in or
/// when the refresh was refused (then the person has to sign in again).
pub async fn access_token(app: &AppHandle) -> Option<String> {
    let tokens = stored_tokens()?;
    if tokens.expires_at > now() + 60 {
        return Some(tokens.access_token);
    }
    let client_id = client_id(app);
    let refresh = tokens.refresh_token?;
    let http = client().ok()?;
    let response: TokenResponse = http
        .post(format!("{}/login/oauth/access_token", base_url().ok()?))
        .form(&[("grant_type", "refresh_token"), ("client_id", client_id.as_str()), ("refresh_token", refresh.as_str())])
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    let renewed = tokens_from(response, Some(refresh));
    store_tokens(&renewed).ok()?;
    Some(renewed.access_token)
}

fn status_of(app: &AppHandle, signed_in: bool) -> GiteaStatus {
    let saved = read_saved(app);
    GiteaStatus {
        configured: !client_id(app).is_empty(),
        signed_in,
        username: if signed_in { saved.username } else { None },
        display_name: if signed_in { saved.display_name } else { None },
        url: base_url().ok(),
    }
}

#[tauri::command]
pub async fn gitea_status(app: AppHandle) -> GiteaStatus {
    let signed_in = access_token(&app).await.is_some();
    status_of(&app, signed_in)
}

#[tauri::command]
pub fn gitea_logout(app: AppHandle) -> Result<GiteaStatus, String> {
    clear_tokens();
    let mut saved = read_saved(&app);
    saved.username = None;
    saved.display_name = None;
    write_saved(&app, &saved)?;
    Ok(status_of(&app, false))
}

#[tauri::command]
pub async fn gitea_login(app: AppHandle) -> Result<GiteaStatus, String> {
    let base = base_url()?;
    let client_id = client_id(&app);
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT))
        .await
        .map_err(|e| format!("Port {REDIRECT_PORT} is in use (is another sign-in running?): {e}"))?;

    let verifier = random_b64(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_b64(24);
    let mut auth = url::Url::parse(&format!("{base}/login/oauth/authorize")).map_err(|e| e.to_string())?;
    auth.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri())
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    app.opener().open_url(auth.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(listener, &state))
        .await
        .map_err(|_| "Sign-in timed out. Try again.".to_string())??;

    let http = client()?;
    let response: TokenResponse = http
        .post(format!("{base}/login/oauth/access_token"))
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri().as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Could not reach Gitea: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Gitea refused the code: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let tokens = tokens_from(response, None);

    let user: GiteaUser = http
        .get(format!("{base}/api/v1/user"))
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Could not reach Gitea: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Gitea would not say who signed in: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    store_tokens(&tokens)?;
    let mut saved = read_saved(&app);
    saved.username = user.login;
    saved.display_name = user.full_name.filter(|name| !name.trim().is_empty());
    write_saved(&app, &saved)?;
    Ok(status_of(&app, true))
}
