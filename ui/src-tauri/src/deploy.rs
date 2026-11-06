//! `Liam-deploy_project`: puts the project in the current folder online on the company platform.
//!
//! The work is already on the company Git server (Liam saves it there after every answer). Deploying
//! gives Coolify a read-only key to that repository, creates the application there, and adds a tile
//! for it on the Homarr dashboard. Running it again for a project that is already online just deploys
//! the newest version.
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
    time::Duration,
};
use tauri::AppHandle;

/// Applications get `<name>.<SUFFIX>`. The platform team points this name (a wildcard) at Coolify.
const SUFFIX: &str = "apps.digitalx.srt";
/// `http` until the wildcard certificate is installed, then `https`.
const SCHEME: &str = "http";
/// How Coolify reaches the Git server over SSH (overridable: `LIAM_GITEA_SSH=git@host:port`-style hosts).
const SSH_USER_HOST: &str = "git@git.digitalx.srt";
const PORT: &str = "3000";

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(not(windows))]
    let _ = command;
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(dir);
    hide_window(&mut command);
    let output = command.output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// One Coolify (or Homarr) call; the answer parsed as JSON when it is.
async fn tool(name: &str, arguments: Value) -> Result<Value, String> {
    let (text, ok) = crate::mcp_tools::gateway_call(name, arguments).await;
    if !ok {
        return Err(format!("{name}: {}", text.chars().take(400).collect::<String>()));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
}

fn text<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

/// An ed25519 key pair made with the system's OpenSSH; the files are removed straight after reading.
fn new_key_pair(label: &str) -> Result<(String, String), String> {
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let file: PathBuf = std::env::temp_dir().join(format!("liam-deploy-{stamp}"));
    let mut command = Command::new("ssh-keygen");
    command.args(["-q", "-t", "ed25519", "-N", "", "-C", label, "-f"]).arg(&file);
    hide_window(&mut command);
    let status = command.status().map_err(|e| format!("ssh-keygen is not available on this computer: {e}"))?;
    let pair = (|| {
        let private = std::fs::read_to_string(&file).ok()?;
        let public = std::fs::read_to_string(file.with_extension("pub")).ok()?;
        Some((private, public.trim().to_string()))
    })();
    let _ = std::fs::remove_file(&file);
    let _ = std::fs::remove_file(file.with_extension("pub"));
    if !status.success() {
        return Err("Could not create a deploy key (ssh-keygen failed).".into());
    }
    pair.ok_or_else(|| "Could not read the deploy key.".into())
}

async fn first_status(app_uuid: &str) -> String {
    for _ in 0..18 {
        tokio::time::sleep(Duration::from_secs(10)).await;
        if let Ok(app) = tool("Coolify-get_application", json!({"uuid": app_uuid})).await {
            let status = text(&app, &["data", "status"]).unwrap_or("").to_string();
            if status.starts_with("running") || status.starts_with("exited") || status.contains("error") {
                return status;
            }
        }
    }
    "building".into()
}

pub async fn run(arguments: &Value, dir: &Path) -> Result<String, String> {
    let app = APP.get().ok_or("Liam is not ready yet.")?.clone();
    if !dir.join("Dockerfile").is_file() || !dir.join("package.json").is_file() {
        return Err("This folder is not a deployable project (no Dockerfile or package.json). Create the project first.".into());
    }

    // 1. The newest work must be on the Git server first.
    let saved = crate::publish::publish_changes(app.clone(), dir.to_string_lossy().to_string(), "Deploy".into()).await?;
    if saved.status == "error" || saved.status == "skipped" || saved.status == "open" {
        return Err(format!("The work is not saved on the company Git server yet, so it cannot be deployed: {}", saved.message));
    }
    let origin = git(dir, &["remote", "get-url", "origin"]).unwrap_or_default();
    let repo = crate::publish::gitea_repo(&origin).ok_or("This project is not on the company Git server.")?;

    let package: Value = std::fs::read_to_string(dir.join("package.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let name = crate::publish::slug(arguments["name"].as_str().or(package["name"].as_str()).unwrap_or("project"));
    let url = format!("{SCHEME}://{name}.{SUFFIX}");

    // 2. Where it goes in Coolify.
    let servers = tool("Coolify-list_servers", json!({})).await?;
    let server_uuid = servers["data"]
        .as_array()
        .and_then(|list| list.iter().find(|s| s["is_reachable"] == true && s["is_usable"] == true))
        .and_then(|s| s["uuid"].as_str())
        .ok_or("Coolify has no server that is ready to run applications.")?
        .to_string();
    let projects = tool("Coolify-list_projects", json!({})).await?;
    let wanted = std::env::var("LIAM_COOLIFY_PROJECT").unwrap_or_else(|_| "My first project".into());
    let project_uuid = projects["data"]
        .as_array()
        .and_then(|list| list.iter().find(|p| p["name"] == wanted.as_str()).or_else(|| list.first()))
        .and_then(|p| p["uuid"].as_str())
        .ok_or("Coolify has no project to put the application in.")?
        .to_string();
    let project = tool("Coolify-get_project", json!({"uuid": project_uuid})).await?;
    let environment = project["data"]["environments"]
        .as_array()
        .and_then(|list| list.iter().find(|e| e["name"] == "production").or_else(|| list.first()))
        .and_then(|e| e["name"].as_str())
        .unwrap_or("production")
        .to_string();

    // 3. Already online? Then deploy the newest version. Otherwise create it.
    let existing = tool("Coolify-list_applications", json!({"project_uuid": project_uuid})).await?;
    let found = existing["data"]
        .as_array()
        .and_then(|list| list.iter().find(|a| a["name"] == name.as_str()))
        .and_then(|a| a["uuid"].as_str())
        .map(str::to_string);
    let (app_uuid, created) = match found {
        Some(uuid) => {
            tool("Coolify-deploy", json!({"uuid": uuid})).await?;
            (uuid, false)
        }
        None => {
            let token = crate::gitea_auth::access_token(&app).await.ok_or("Not signed in to Gitea.")?;
            let (private, public) = new_key_pair(&format!("liam-deploy-{name}"))?;
            crate::publish::add_deploy_key(&token, &repo, &format!("coolify-{name}"), &public).await?;
            let key = tool(
                "Coolify-manage_private_key",
                json!({"action": "create", "data": {"name": format!("liam-{name}"), "description": format!("Read-only deploy key for {repo}"), "private_key": private}}),
            )
            .await?;
            let key_uuid = text(&key, &["data", "uuid"]).or_else(|| text(&key, &["uuid"])).ok_or("Coolify did not return the key it created.")?.to_string();
            let ssh = std::env::var("LIAM_GITEA_SSH").unwrap_or_else(|_| SSH_USER_HOST.into());
            let created = tool(
                "Coolify-create_application",
                json!({"action": "deploy_key", "data": {
                    "project_uuid": project_uuid, "environment_name": environment, "server_uuid": server_uuid,
                    "private_key_uuid": key_uuid, "git_repository": format!("{ssh}:{repo}.git"), "git_branch": "main",
                    "build_pack": "dockerfile", "ports_exposes": PORT, "name": name, "domains": url,
                    "instant_deploy": true,
                }}),
            )
            .await?;
            let uuid = text(&created, &["data", "uuid"]).or_else(|| text(&created, &["uuid"])).ok_or("Coolify did not return the application it created.")?.to_string();
            (uuid, true)
        }
    };

    // 4. A tile on the dashboard people open applications from (once).
    let tile = match tool("Homarr-app_search", json!({"query": name, "limit": 20})).await {
        Ok(found) if found.to_string().contains(&format!("\"{name}\"")) => "already on the dashboard",
        _ => match tool(
            "Homarr-app_create",
            json!({"name": name, "description": format!("Created with Liam ({repo})"), "iconUrl": format!("{url}/icon.svg"), "href": url, "pingUrl": ""}),
        )
        .await
        {
            Ok(_) => "added to the dashboard",
            Err(error) => return Ok(format!("Deployed, but the dashboard tile failed: {error}")),
        },
    };

    let status = first_status(&app_uuid).await;
    Ok(format!(
        "{} {name}. Address: {url} ({tile}). Status: {status}. If the address does not open yet, the first build can take a few minutes; check Coolify-get_application or Coolify-get_logs for application {app_uuid}.",
        if created { "Created and deployed" } else { "Redeployed" }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_deploy_key_pair_is_made_and_the_files_are_removed() {
        let (private, public) = new_key_pair("liam-test").expect("ssh-keygen is available");
        assert!(private.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----"));
        assert!(public.starts_with("ssh-ed25519 "));
        assert!(public.ends_with("liam-test"));
    }

    #[test]
    fn answers_are_read_by_path() {
        let answer = json!({"data": {"uuid": "abc", "status": "running:healthy"}});
        assert_eq!(text(&answer, &["data", "uuid"]), Some("abc"));
        assert_eq!(text(&answer, &["data", "missing"]), None);
    }
}
