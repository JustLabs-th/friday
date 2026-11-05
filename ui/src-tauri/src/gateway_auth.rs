//! Sign in to the company LLM gateway.
//!
//! The browser does the Keycloak sign-in (OIDC authorization code + PKCE, redirecting to a loopback
//! port). The ID token is then presented to the key portal, which issues this person's virtual key.
//! The key goes straight into the OS credential store: the frontend only ever sees who is signed in.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const SERVICE: &str = "friday";
const KEY_ENTRY: &str = "gateway-key";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);

struct Config {
    issuer: String,
    client_id: String,
    redirect_uri: String,
    portal_url: String,
}

/// Defaults match the company deployment; each can be overridden with an environment variable.
fn config() -> Result<Config, String> {
    let get = |name: &str, default: &str| std::env::var(name).unwrap_or_else(|_| default.to_string());
    let cfg = Config {
        issuer: get("FRIDAY_OIDC_ISSUER", "https://sso.digitalx.srt/auth/realms/srt").trim_end_matches('/').to_string(),
        client_id: get("FRIDAY_OIDC_CLIENT_ID", "meshroom-ai"),
        redirect_uri: get("FRIDAY_OIDC_REDIRECT_URI", "http://127.0.0.1:41829/callback"),
        portal_url: get("FRIDAY_PORTAL_URL", "https://key-portal.digitalx.srt").trim_end_matches('/').to_string(),
    };
    for (name, url) in [("issuer", &cfg.issuer), ("portal", &cfg.portal_url)] {
        if !url.starts_with("https://") {
            return Err(format!("The {name} URL must be https."));
        }
    }
    Ok(cfg)
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub signed_in: bool,
    pub username: Option<String>,
    pub expires_at: Option<String>,
}

fn status_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("gateway-session.json"))
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, KEY_ENTRY).map_err(|e| e.to_string())
}

/// The stored gateway key, for the code that configures Codex. Never sent to the frontend.
pub fn stored_key() -> Option<String> {
    entry().ok()?.get_password().ok()
}

fn read_status(app: &AppHandle) -> GatewayStatus {
    let has_key = stored_key().is_some();
    let saved: GatewayStatus = status_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    GatewayStatus { signed_in: has_key, ..saved }
}

#[tauri::command]
pub fn gateway_status(app: AppHandle) -> GatewayStatus {
    read_status(&app)
}

#[tauri::command]
pub fn gateway_logout(app: AppHandle) -> Result<GatewayStatus, String> {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
    if let Ok(p) = status_path(&app) {
        let _ = std::fs::remove_file(p);
    }
    Ok(GatewayStatus::default())
}

fn random_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct IssuedKey {
    key_value: String,
    expires_at: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct PortalLogin {
    username: Option<String>,
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Friday</title>\
<body style=\"font-family:system-ui;margin:4rem auto;max-width:28rem;text-align:center\">\
<h2>เข้าสู่ระบบแล้ว</h2><p>กลับไปที่ Friday ได้เลย ปิดหน้านี้ได้</p></body>";

/// Waits for the browser to come back to the loopback redirect and returns the authorization code.
async fn wait_for_code(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        let request = String::from_utf8_lossy(&buf[..n]);
        let target = request.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("").to_string();
        let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{target}")) else { continue };
        if url.path() != "/callback" {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
            continue;
        }
        let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.to_string());
        let (status, body, result) = if param("state").as_deref() != Some(expected_state) {
            ("400 Bad Request", "State did not match.".to_string(), Err("The sign-in response did not match this request.".to_string()))
        } else if let Some(err) = param("error") {
            ("400 Bad Request", "Sign-in was not completed.".to_string(), Err(format!("Sign-in was refused: {err}")))
        } else if let Some(code) = param("code") {
            ("200 OK", DONE_PAGE.to_string(), Ok(code))
        } else {
            ("400 Bad Request", "No code.".to_string(), Err("The sign-in response had no code.".to_string()))
        };
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
        return result;
    }
}

/// Opens the browser for Keycloak, then trades the result for a gateway key held in the credential store.
#[tauri::command]
pub async fn gateway_login(app: AppHandle) -> Result<GatewayStatus, String> {
    let cfg = config()?;
    let redirect = url::Url::parse(&cfg.redirect_uri).map_err(|e| e.to_string())?;
    if redirect.host_str() != Some("127.0.0.1") {
        return Err("The redirect address must be 127.0.0.1.".into());
    }
    let port = redirect.port().ok_or("The redirect address needs a fixed port.")?;
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("Port {port} is in use (is another app signing in?): {e}"))?;

    let verifier = random_b64(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_b64(24);
    let mut auth = url::Url::parse(&format!("{}/protocol/openid-connect/auth", cfg.issuer)).map_err(|e| e.to_string())?;
    auth.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &cfg.client_id)
        .append_pair("redirect_uri", &cfg.redirect_uri)
        .append_pair("scope", "openid profile email")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    app.opener().open_url(auth.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(listener, &state))
        .await
        .map_err(|_| "Sign-in timed out. Try again.".to_string())??;

    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let token: TokenResponse = http
        .post(format!("{}/protocol/openid-connect/token", cfg.issuer))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", cfg.redirect_uri.as_str()),
            ("client_id", cfg.client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Could not reach the sign-in server: {e}"))?
        .error_for_status()
        .map_err(|e| format!("The sign-in server refused the code: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let id_token = token.id_token.ok_or("The sign-in server returned no ID token.")?;

    let portal = |path: &str| {
        http.post(format!("{}{}", cfg.portal_url, path)).bearer_auth(&id_token)
    };
    let login: PortalLogin = portal("/api/login")
        .send()
        .await
        .map_err(|e| format!("Could not reach the key portal: {e}"))?
        .error_for_status()
        .map_err(|e| format!("The key portal refused this account: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    // Issuing rotates: any key this person already holds (in another app) stops working.
    let issued: IssuedKey = portal("/api/key/issue")
        .send()
        .await
        .map_err(|e| format!("Could not reach the key portal: {e}"))?
        .error_for_status()
        .map_err(|e| format!("The key portal could not issue a key: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    entry()?.set_password(&issued.key_value).map_err(|e| format!("Could not save the key: {e}"))?;
    let status = GatewayStatus {
        signed_in: true,
        username: login.username,
        expires_at: issued.expires_at.map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())),
    };
    if let Ok(path) = status_path(&app) {
        let _ = std::fs::write(path, serde_json::to_string(&status).unwrap_or_default());
    }
    Ok(status)
}
