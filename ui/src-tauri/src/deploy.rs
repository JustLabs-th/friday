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
const PORT: &str = "3000";
const GIT_HOST: &str = "git.digitalx.srt";
const GIT_SSH_PORT: &str = "22";

/// How Coolify reaches the repository over SSH. By address rather than name, because the containers on
/// the Coolify server may not resolve the company names. The port is always written out: without it a
/// numeric owner such as `015298/work-logs` is read as a port number.
fn ssh_remote(repo: &str) -> String {
    let host = std::env::var("LIAM_GITEA_SSH_HOST")
        .ok()
        .or_else(|| {
            use std::net::ToSocketAddrs;
            (GIT_HOST, 22).to_socket_addrs().ok()?.find(|a| a.is_ipv4()).map(|a| a.ip().to_string())
        })
        .unwrap_or_else(|| GIT_HOST.to_string());
    let port = std::env::var("LIAM_GITEA_SSH_PORT").unwrap_or_else(|_| GIT_SSH_PORT.into());
    format!("git@{host}:{port}/{repo}.git")
}

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

/// The reason a deployment failed, from the lines Coolify logged.
async fn failure_reason(deployment: &Value) -> String {
    let uuid = deployment["deployment_uuid"].as_str().unwrap_or("");
    let log = tool("Coolify-get_deployment", json!({"uuid": uuid, "include_log_summary": true, "log_lines": 60}))
        .await
        .ok()
        .and_then(|d| text(&d, &["data", "log_summary", "text"]).map(str::to_string))
        .unwrap_or_default();
    let mut lines: Vec<&str> = log
        .lines()
        .filter(|l| l.contains("Error") || l.contains("error") || l.contains("fatal") || l.contains("failed"))
        .collect();
    let tail = lines.split_off(lines.len().saturating_sub(4)).join(" | ");
    let hint = if log.contains("Could not resolve hostname") {
        " The Coolify server cannot look up a company name (DNS), so the platform team must make the company names resolvable from the Coolify server."
    } else {
        ""
    };
    format!("{}{hint}", tail.chars().take(500).collect::<String>())
}

/// Waits (up to four minutes) for the newest deployment: `Ok` with the application status when it is up
/// or still building, `Err` with the reason when it failed.
async fn wait_for_build(app_uuid: &str) -> Result<String, String> {
    for _ in 0..24 {
        tokio::time::sleep(Duration::from_secs(10)).await;
        let Ok(list) = tool("Coolify-list_deployments", json!({"application_uuid": app_uuid})).await else { continue };
        let newest = list["data"]
            .as_array()
            .and_then(|items| items.iter().max_by_key(|d| d["created_at"].as_str().unwrap_or("").to_string()))
            .cloned();
        let Some(deployment) = newest else { continue };
        match deployment["status"].as_str().unwrap_or("") {
            "finished" => {
                let app = tool("Coolify-get_application", json!({"uuid": app_uuid})).await.unwrap_or_default();
                return Ok(text(&app, &["data", "status"]).unwrap_or("running").to_string());
            }
            "failed" | "cancelled-by-user" => {
                return Err(format!(
                    "The deployment failed: {} This is a problem on the platform side, not in the project. Do not try again; tell the user in plain words that the platform team has to fix it.",
                    failure_reason(&deployment).await
                ));
            }
            _ => {}
        }
    }
    Ok("still building".into())
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
            // An application made earlier may have the wrong address; make sure it points at the repository.
            tool(
                "Coolify-manage_application",
                json!({"action": "update", "uuid": uuid, "data": {"git_repository": ssh_remote(&repo), "git_branch": "main"}}),
            )
            .await?;
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
            let created = tool(
                "Coolify-create_application",
                json!({"action": "deploy_key", "data": {
                    "project_uuid": project_uuid, "environment_name": environment, "server_uuid": server_uuid,
                    "private_key_uuid": key_uuid, "git_repository": ssh_remote(&repo), "git_branch": "main",
                    "build_pack": "dockerfile", "ports_exposes": PORT, "name": name, "domains": url,
                    "instant_deploy": true,
                }}),
            )
            .await?;
            let uuid = text(&created, &["data", "uuid"]).or_else(|| text(&created, &["uuid"])).ok_or("Coolify did not return the application it created.")?.to_string();
            (uuid, true)
        }
    };

    // 4. Wait for the build; only a project that is up gets a tile on the dashboard.
    let status = wait_for_build(&app_uuid).await?;

    // 5. A tile on the dashboard people open applications from (once).
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

    Ok(format!(
        "{} {name}. Address: {url} ({tile}). Status: {status}. If the address does not open from this computer, the name {name}.{SUFFIX} may not be set up on it yet (application {app_uuid}).",
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
    fn the_ssh_address_always_has_a_port_so_a_numeric_owner_is_not_read_as_one() {
        std::env::set_var("LIAM_GITEA_SSH_HOST", "192.168.100.7");
        assert_eq!(ssh_remote("015298/work-logs"), "git@192.168.100.7:22/015298/work-logs.git");
        std::env::remove_var("LIAM_GITEA_SSH_HOST");
    }

    #[test]
    fn answers_are_read_by_path() {
        let answer = json!({"data": {"uuid": "abc", "status": "running:healthy"}});
        assert_eq!(text(&answer, &["data", "uuid"]), Some("abc"));
        assert_eq!(text(&answer, &["data", "missing"]), None);
    }
}
