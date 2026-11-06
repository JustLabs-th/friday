//! Saves an agent's work to the company Gitea on its own, so people who do not know git never have to.
//!
//! After a turn finishes Friday (not the agent, whose sandbox has no network) does the git work:
//! a folder that is not a repository becomes one and gets a private repo on Gitea; later changes go
//! to a branch, then a pull request that is merged straight away. Nothing is forced and nothing is
//! deleted except the branch it just merged.

use crate::gitea_auth;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command;
use tokio::sync::Mutex;

static BUSY: Mutex<()> = Mutex::const_new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Published {
    /// `saved`, `nothing`, `skipped`, `open` (pull request left open) or `error`.
    pub status: &'static str,
    /// A sentence for the person, in plain Thai.
    pub message: String,
    pub url: Option<String>,
}

fn done(status: &'static str, message: impl Into<String>, url: Option<String>) -> Result<Published, String> {
    Ok(Published { status, message: message.into(), url })
}

#[derive(Deserialize)]
struct User {
    login: String,
    full_name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct Repo {
    default_branch: Option<String>,
    clone_url: Option<String>,
    html_url: Option<String>,
}

#[derive(Deserialize)]
struct Pull {
    number: u64,
    html_url: Option<String>,
}

fn base_url() -> String {
    std::env::var("FRIDAY_GITEA_URL").unwrap_or_else(|_| "https://git.digitalx.srt".into()).trim_end_matches('/').to_string()
}

struct Auth {
    login: String,
    token: String,
}

/// Runs git in `cwd`. The token travels in environment variables, never on the command line, and the
/// Windows certificate store is used so the company CA is trusted.
async fn git(cwd: &Path, auth: &Auth, identity: &[String], args: &[&str]) -> Result<String, String> {
    let header = format!("Authorization: Basic {}", STANDARD.encode(format!("{}:{}", auth.login, auth.token)));
    let mut command = Command::new("git");
    command
        .args(identity)
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_CONFIG_COUNT", "3")
        .env("GIT_CONFIG_KEY_0", "http.extraHeader")
        .env("GIT_CONFIG_VALUE_0", header)
        .env("GIT_CONFIG_KEY_1", "credential.helper")
        .env("GIT_CONFIG_VALUE_1", "")
        .env("GIT_CONFIG_KEY_2", "http.sslBackend")
        .env("GIT_CONFIG_VALUE_2", "schannel")
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(120), command.output())
        .await
        .map_err(|_| "git took too long".to_string())?
        .map_err(|e| format!("git is not available: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let text = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // The header carries the token; make sure it can never reach the screen.
        Err(text.replace(&auth.token, "***"))
    }
}

async fn api<T: for<'de> Deserialize<'de>>(
    http: &reqwest::Client,
    auth: &Auth,
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<T, (u16, String)> {
    let mut request = http.request(method, format!("{}/api/v1{path}", base_url())).bearer_auth(&auth.token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.map_err(|e| (0, format!("Could not reach Gitea: {e}")))?;
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err((status, text));
    }
    // Merge answers with an empty body.
    let text = if text.trim().is_empty() { "null".to_string() } else { text };
    serde_json::from_str(&text).map_err(|e| (status, e.to_string()))
}

fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "project".into() } else { out }
}

/// `owner/repo` of the `origin` remote when it lives on the company Gitea.
fn gitea_repo(origin: &str) -> Option<String> {
    let rest = origin.strip_prefix(&format!("{}/", base_url()))?;
    let path = rest.trim_end_matches('/').trim_end_matches(".git");
    if path.split('/').count() == 2 { Some(path.to_string()) } else { None }
}

fn first_line(text: &str) -> String {
    let line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("Update").trim();
    let mut short: String = line.chars().take(72).collect();
    if line.chars().count() > 72 {
        short.push('…');
    }
    short
}

/// Saves what changed in `cwd` to Gitea. `summary` (the person's request) names the commit.
#[tauri::command]
pub async fn publish_changes(app: AppHandle, cwd: String, summary: String) -> Result<Published, String> {
    let _only_one = BUSY.lock().await;
    let dir = Path::new(&cwd);
    if !dir.is_dir() {
        return done("skipped", "ไม่พบโฟลเดอร์ของ project", None);
    }
    let Some(token) = gitea_auth::access_token(&app).await else {
        return done("skipped", "ยังไม่ได้เชื่อมต่อ Gitea จึงยังไม่ได้บันทึกงานขึ้น Git server", None);
    };
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut auth = Auth { login: String::new(), token };
    let user: User = match api(&http, &auth, reqwest::Method::GET, "/user", None).await {
        Ok(user) => user,
        Err((401, _)) => return done("skipped", "การเชื่อมต่อ Gitea หมดอายุ เข้าสู่ระบบใหม่ในหน้า Connectors", None),
        Err((_, e)) => return done("error", format!("เชื่อมต่อ Gitea ไม่ได้: {e}"), None),
    };
    auth.login = user.login.clone();
    let identity = vec![
        "-c".to_string(),
        format!("user.name={}", user.full_name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| user.login.clone())),
        "-c".to_string(),
        format!("user.email={}", user.email.clone().filter(|e| !e.is_empty()).unwrap_or_else(|| format!("{}@users.noreply.local", user.login))),
    ];
    let title = first_line(&summary);

    let is_repo = git(dir, &auth, &[], &["rev-parse", "--is-inside-work-tree"]).await.is_ok();
    if !is_repo {
        return first_save(dir, &http, &auth, &identity, &title).await;
    }
    let origin = git(dir, &auth, &[], &["remote", "get-url", "origin"]).await.unwrap_or_default();
    let Some(repo_path) = gitea_repo(&origin) else {
        return done("skipped", "project นี้ไม่ได้อยู่บน Git server ของบริษัท จึงไม่ได้บันทึกอัตโนมัติ", None);
    };

    if git(dir, &auth, &[], &["status", "--porcelain"]).await?.is_empty() {
        return done("nothing", "ไม่มีการเปลี่ยนแปลงให้บันทึก", None);
    }
    let repo: Repo = match api(&http, &auth, reqwest::Method::GET, &format!("/repos/{repo_path}"), None).await {
        Ok(repo) => repo,
        Err((_, e)) => return done("error", format!("อ่านข้อมูล repo ไม่ได้: {e}"), None),
    };
    let base = repo.default_branch.unwrap_or_else(|| "main".into());
    let branch = format!("friday/{}", chrono::Utc::now().format("%Y%m%d-%H%M%S"));

    let run = async {
        git(dir, &auth, &[], &["checkout", "-b", &branch]).await?;
        git(dir, &auth, &[], &["add", "-A"]).await?;
        git(dir, &auth, &identity, &["commit", "-m", &title]).await?;
        git(dir, &auth, &[], &["push", "-u", "origin", &branch]).await?;
        Ok::<(), String>(())
    };
    if let Err(e) = run.await {
        return done("error", format!("บันทึกงานไม่สำเร็จ: {e}"), None);
    }

    let pull: Pull = match api(
        &http,
        &auth,
        reqwest::Method::POST,
        &format!("/repos/{repo_path}/pulls"),
        Some(serde_json::json!({"head": branch, "base": base, "title": title, "body": "สร้างโดย Friday อัตโนมัติ"})),
    )
    .await
    {
        Ok(pull) => pull,
        Err((_, e)) => return done("error", format!("สร้าง pull request ไม่สำเร็จ: {e}"), None),
    };
    let merged: Result<serde_json::Value, _> = api(
        &http,
        &auth,
        reqwest::Method::POST,
        &format!("/repos/{repo_path}/pulls/{}/merge", pull.number),
        Some(serde_json::json!({"Do": "squash", "delete_branch_after_merge": true})),
    )
    .await;
    if merged.is_err() {
        return done(
            "open",
            format!("บันทึกงานแล้ว (PR #{}) แต่ยังรวมเข้า {base} เองไม่ได้ ต้องให้คนตรวจใน Gitea", pull.number),
            pull.html_url,
        );
    }
    // Bring the folder back to the main branch, now including the merge.
    let back = async {
        git(dir, &auth, &[], &["checkout", &base]).await?;
        git(dir, &auth, &[], &["pull", "--ff-only", "origin", &base]).await?;
        let _ = git(dir, &auth, &[], &["branch", "-D", &branch]).await;
        Ok::<(), String>(())
    };
    match back.await {
        Ok(()) => done("saved", format!("บันทึกงานขึ้น Gitea แล้ว (PR #{} รวมเข้า {base})", pull.number), pull.html_url),
        Err(e) => done("error", format!("รวมงานบน Gitea แล้ว แต่ปรับโฟลเดอร์ในเครื่องไม่สำเร็จ: {e}"), pull.html_url),
    }
}

/// A folder that is not a repository yet: make it one, create a private repo, and push everything.
async fn first_save(dir: &Path, http: &reqwest::Client, auth: &Auth, identity: &[String], title: &str) -> Result<Published, String> {
    // Nothing to save in an empty folder.
    let has_files = std::fs::read_dir(dir).map(|mut entries| entries.next().is_some()).unwrap_or(false);
    if !has_files {
        return done("nothing", "ไม่มีไฟล์ให้บันทึก", None);
    }
    let name = slug(&dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
    let mut repo: Option<Repo> = None;
    for attempt in 0..3 {
        let candidate = if attempt == 0 { name.clone() } else { format!("{name}-{}", &uuid::Uuid::new_v4().simple().to_string()[..4]) };
        match api::<Repo>(
            http,
            auth,
            reqwest::Method::POST,
            "/user/repos",
            Some(serde_json::json!({"name": candidate, "private": true, "default_branch": "main"})),
        )
        .await
        {
            Ok(created) => {
                repo = Some(created);
                break;
            }
            Err((409, _)) => continue,
            Err((_, e)) => return done("error", format!("สร้าง repo บน Gitea ไม่สำเร็จ: {e}"), None),
        }
    }
    let Some(repo) = repo else {
        return done("error", "สร้าง repo บน Gitea ไม่สำเร็จ (ชื่อซ้ำ)", None);
    };
    let clone_url = repo.clone_url.ok_or("Gitea did not return a clone URL")?;
    // Keep secrets and bulky generated folders out of the first upload.
    let ignore = dir.join(".gitignore");
    if !ignore.exists() {
        let _ = std::fs::write(
            &ignore,
            ".env
.env.*
*.pem
*.key
node_modules/
.venv/
__pycache__/
dist/
build/
target/
.DS_Store
Thumbs.db
",
        );
    }
    let steps = async {
        git(dir, auth, &[], &["init", "-b", "main"]).await?;
        git(dir, auth, &[], &["add", "-A"]).await?;
        git(dir, auth, identity, &["commit", "-m", title]).await?;
        git(dir, auth, &[], &["remote", "add", "origin", &clone_url]).await?;
        git(dir, auth, &[], &["push", "-u", "origin", "main"]).await?;
        Ok::<(), String>(())
    };
    match steps.await {
        Ok(()) => done("saved", "สร้างที่เก็บงานบน Gitea (private) และบันทึกงานแล้ว", repo.html_url),
        Err(e) => done("error", format!("บันทึกงานไม่สำเร็จ: {e}"), repo.html_url),
    }
}
