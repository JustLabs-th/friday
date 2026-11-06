//! Tools Liam provides to the agent itself (not through the gateway), and the skills it installs.
//!
//! - `Liam-new_nextjs_project` copies the company Next.js template into the project folder.
//! - `Liam-check_packages` compares a project's packages with the approved stack and Nexus.
//!
//! They act on the folder of the thread that called them, which Liam remembers when a thread starts.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

static THREADS: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

/// Rules every chat gets, whatever the task. They are sent with each thread start and resume.
pub const RULES: &str = "You work for people who are not developers. Reply in the language they write in, in plain words.
Finish what you start. Never end your answer with a plan or a promise such as \"I will check ...\", \"next I will ...\" or \"เดี๋ยวผม...\": in the same turn, do the thing by calling the tool, then report the result. End with a short summary of what was done, or say plainly what is left and why.
To put a project online use the tool Liam-deploy_project. To make a web app or website use the skill liam-nextjs-project and the tool Liam-new_nextjs_project.";

/// Remembers which folder a thread works in, from a `thread/start` or `thread/resume` exchange.
pub fn remember_thread(params: &Value, result: &Value) {
    let id = result["thread"]["id"].as_str();
    let cwd = result["thread"]["cwd"].as_str().or_else(|| params["cwd"].as_str());
    if let (Some(id), Some(cwd)) = (id, cwd) {
        let cwd = PathBuf::from(cwd.trim_start_matches(r"\\?\"));
        if let Ok(mut map) = THREADS.lock() {
            map.get_or_insert_with(HashMap::new).insert(id.to_string(), cwd);
        }
    }
}

/// The folder a chat works in, when Liam has seen it start.
pub fn thread_dir(thread_id: &str) -> Option<PathBuf> {
    project_dir(thread_id).ok()
}

fn project_dir(thread_id: &str) -> Result<PathBuf, String> {
    THREADS
        .lock()
        .ok()
        .and_then(|map| map.as_ref().and_then(|m| m.get(thread_id).cloned()))
        .filter(|dir| dir.is_dir())
        .ok_or_else(|| "Cannot tell which project folder this chat uses. Open the chat again and retry.".into())
}

pub fn specs() -> Vec<Value> {
    vec![
        json!({"type": "function", "name": "Liam-new_nextjs_project",
            "description": "Start a Next.js project in the current project folder from the company template (approved packages, Tailwind, ready-made components, Dockerfile). Only for an empty folder; call it once.",
            "inputSchema": {"type": "object", "properties": {
                "name": {"type": "string", "description": "Short project name: lowercase letters, digits and hyphens, e.g. work-log."}
            }, "required": ["name"]}}),
        json!({"type": "function", "name": "Liam-deploy_project",
            "description": "Put the current project online: deploys it on the company platform, gives it an address and adds it to the dashboard. Run again after changes to publish the newest version. Needs a project created with Liam-new_nextjs_project.",
            "inputSchema": {"type": "object", "properties": {
                "name": {"type": "string", "description": "Optional short name for the address (lowercase letters, digits, hyphens). Default: the project name."}
            }}}),
        json!({"type": "function", "name": "Liam-check_packages",
            "description": "Check the current project's packages against the company-approved list and Nexus. Call it before adding a package and again before finishing.",
            "inputSchema": {"type": "object", "properties": {}}}),
    ]
}

/// Runs one of Liam's own tools. `None` when `name` is not one of them.
pub async fn call(name: &str, arguments: &Value, thread_id: &str) -> Option<(String, bool)> {
    let outcome = match name {
        "Liam-new_nextjs_project" => new_nextjs_project(arguments, thread_id),
        "Liam-check_packages" => check_packages(thread_id).await,
        "Liam-deploy_project" => match project_dir(thread_id) {
            Ok(dir) => crate::deploy::run(arguments, &dir).await,
            Err(error) => Err(error),
        },
        _ => return None,
    };
    Some(match outcome {
        Ok(text) => (text, true),
        Err(text) => (text, false),
    })
}

// ---------------------------------------------------------------- template

fn template_dir() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("templates").join("nextjs");
    if beside.is_dir() {
        return Some(beside);
    }
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates").join("nextjs");
    source.is_dir().then_some(source)
}

/// Files whose `__NAME__` placeholder is replaced; the lockfile and the rest are copied untouched.
const NAMED: &[&str] = &["package.json", "app/layout.tsx", "app/page.tsx", "README.md"];

fn valid_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    (2..=40).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.ends_with('-')
}

fn copy_tree(from: &Path, to: &Path, root: &Path, name: &str, created: &mut Vec<String>) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_tree(&source, &target, root, name, created)?;
            continue;
        }
        let relative = target.strip_prefix(root).unwrap_or(&target).to_string_lossy().replace('\\', "/");
        if NAMED.contains(&relative.as_str()) {
            let text = fs::read_to_string(&source).map_err(|e| e.to_string())?;
            fs::write(&target, text.replace("__NAME__", name)).map_err(|e| e.to_string())?;
        } else {
            fs::copy(&source, &target).map_err(|e| e.to_string())?;
        }
        created.push(relative);
    }
    Ok(())
}

fn new_nextjs_project(arguments: &Value, thread_id: &str) -> Result<String, String> {
    let name = arguments["name"].as_str().unwrap_or("").trim().to_lowercase();
    if !valid_name(&name) {
        return Err("The name must be 2-40 characters: lowercase letters, digits and hyphens, starting with a letter (for example work-log). Pick one and call the tool again.".into());
    }
    let dir = project_dir(thread_id)?;
    let existing: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| !n.starts_with('.'))
        .collect();
    if !existing.is_empty() {
        return Err(format!(
            "This folder already has files ({}). A new project needs an empty folder. If a project is already here, edit it instead of creating another.",
            existing.iter().take(6).cloned().collect::<Vec<_>>().join(", ")
        ));
    }
    let template = template_dir().ok_or("The Next.js template is missing from this installation.")?;
    let mut created = Vec::new();
    copy_tree(&template, &dir, &dir, &name, &mut created)?;
    created.sort();
    Ok(format!(
        "Created the Next.js project \"{name}\" in the project folder ({} files). Edit app/page.tsx to build the first screen; ready-made parts are in components/ui. Packages are already pinned and locked: do not run npm install. Call Liam-check_packages before finishing.",
        created.len()
    ))
}

// ---------------------------------------------------------------- packages

/// The approved dependencies, straight from the template's package.json.
fn approved() -> HashMap<String, String> {
    let template: Value = serde_json::from_str(include_str!("../templates/nextjs/package.json")).unwrap_or_default();
    let mut map = HashMap::new();
    for section in ["dependencies", "devDependencies"] {
        if let Some(entries) = template[section].as_object() {
            for (name, version) in entries {
                map.insert(name.clone(), version.as_str().unwrap_or("").to_string());
            }
        }
    }
    map
}

async fn in_nexus(http: &reqwest::Client, name: &str) -> Option<bool> {
    let url = format!("{}{}", crate::NEXUS_NPM, name.replace('/', "%2F"));
    let status = http.get(url).send().await.ok()?.status();
    Some(status.is_success())
}

async fn check_packages(thread_id: &str) -> Result<String, String> {
    let dir = project_dir(thread_id)?;
    let text = fs::read_to_string(dir.join("package.json"))
        .map_err(|_| "There is no package.json here, so there is nothing to check. This folder is not a Next.js project yet.".to_string())?;
    let package: Value = serde_json::from_str(&text).map_err(|e| format!("package.json is not valid JSON: {e}"))?;
    let approved = approved();
    let http = crate::trust::http_builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut problems: Vec<String> = Vec::new();
    for section in ["dependencies", "devDependencies"] {
        let Some(entries) = package[section].as_object() else { continue };
        for (name, version) in entries {
            let version = version.as_str().unwrap_or("");
            match approved.get(name) {
                Some(expected) if expected == version => {}
                Some(expected) => problems.push(format!("{name}: version {version} is not the approved {expected}. Use {expected}.")),
                None => match in_nexus(&http, name).await {
                    Some(true) => problems.push(format!("{name}: not in the approved stack (it exists in Nexus). Needs approval from the platform team before it is used.")),
                    Some(false) => problems.push(format!("{name}: not approved and not available in Nexus, so it cannot be installed.")),
                    None => problems.push(format!("{name}: not in the approved stack, and Nexus could not be reached to check it.")),
                },
            }
        }
    }
    if !dir.join("package-lock.json").is_file() {
        problems.push("package-lock.json is missing. It must stay in the project.".into());
    }
    match fs::read_to_string(dir.join(".npmrc")) {
        Ok(npmrc) if npmrc.contains("nexus.digitalx.srt/repository/npm-group") => {}
        _ => problems.push(".npmrc must point to https://nexus.digitalx.srt/repository/npm-group/. Restore it.".into()),
    }
    if let Ok(dockerfile) = fs::read_to_string(dir.join("Dockerfile")) {
        for line in dockerfile.lines().filter(|l| l.trim_start().to_uppercase().starts_with("FROM ")) {
            if !line.contains("registry.digitalx.srt/") {
                problems.push(format!("Dockerfile: \"{}\" must use an image from registry.digitalx.srt, not the internet.", line.trim()));
            }
        }
    }

    if problems.is_empty() {
        Ok("All packages match the approved stack.".into())
    } else {
        Err(format!("Found {} problem(s):\n- {}", problems.len(), problems.join("\n- ")))
    }
}

// ---------------------------------------------------------------- skills

const SKILLS: &[(&str, &str)] = &[("liam-nextjs-project", include_str!("../skills/liam-nextjs-project/SKILL.md"))];

/// Puts Liam's own skills in the engine's skills folder. They are rewritten each time so an updated Liam
/// brings its updated instructions. Skills the user added themselves are left alone.
pub fn install_skills(engine_home: &Path) {
    for (name, content) in SKILLS {
        let dir = engine_home.join("skills").join(name);
        if fs::create_dir_all(&dir).is_ok() {
            let _ = fs::write(dir.join("SKILL.md"), content);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_checked() {
        assert!(valid_name("work-log"));
        assert!(valid_name("a1"));
        assert!(!valid_name("Work-Log"));
        assert!(!valid_name("1app"));
        assert!(!valid_name("a"));
        assert!(!valid_name("app-"));
        assert!(!valid_name("my app"));
    }

    #[test]
    fn the_approved_list_has_next_and_react() {
        let approved = approved();
        assert_eq!(approved.get("next").map(String::as_str), Some("16.4.3"));
        assert!(approved.contains_key("react"));
    }

    #[test]
    fn a_new_project_is_copied_with_its_name() {
        let dir = std::env::temp_dir().join(format!("liam-tpl-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let mut map = HashMap::new();
        map.insert("t1".to_string(), dir.clone());
        *THREADS.lock().unwrap() = Some(map);
        let message = new_nextjs_project(&json!({"name": "demo-app"}), "t1").unwrap();
        assert!(message.contains("demo-app"));
        let package = fs::read_to_string(dir.join("package.json")).unwrap();
        assert!(package.contains("\"name\": \"demo-app\""));
        assert!(!package.contains("__NAME__"));
        assert!(dir.join(".npmrc").is_file(), "dotfiles are copied");
        assert!(dir.join("package-lock.json").is_file());
        // A second call must refuse: the folder is no longer empty.
        assert!(new_nextjs_project(&json!({"name": "demo-app"}), "t1").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
