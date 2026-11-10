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
How your work ends: the moment you send a message that does not call a tool, your turn is over and the person gets that message as your final answer. Nothing happens afterwards. So:
- A message that says what you are about to do (\"I will ...\", \"let me ...\", \"next I will ...\", \"เดี๋ยวผม...\", \"ต่อไปจะ...\") must also contain the tool call that does it. If you are not calling a tool in that message, do not say you will.
- Do not narrate between steps. Work through the tools, and write one message at the end, after everything the person asked for is really done and checked.
- The task is finished only when the person's whole request is done (for example, if they asked to put it online, only after Liam-deploy_project has returned). If something is left, do it now; if you cannot, say plainly what is left and why.
- The final message is two or three short sentences about what was done and what the person can do next.
This computer runs Windows with PowerShell: there are no heredocs (<<), and Unix tools may be missing. Write and change files with the file-editing tool or a PowerShell command. Write text in the person's language (such as Thai) directly in the file as normal characters, never as \\u escape codes, and never change a file by running a script that rewrites its whole content when a small edit will do.
To put a project online use the tool Liam-deploy_project. To make a web app or website use the skill liam-nextjs-project and the tool Liam-new_nextjs_project. Apps put online are protected by the company sign-in; never build your own login.";

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
        json!({"type": "function", "name": "Liam-upgrade_project",
            "description": "Bring a Next.js project that was started earlier up to date with the company template: adds the signed-in person's name and a sign-out link to every page, and the helper getUser() in lib/user.ts. Safe to run again (it also refreshes those two platform files); it never changes the user's own screens. Call it when a project lacks lib/user.ts, or when the sign-in or sign-out link needs an update.",
            "inputSchema": {"type": "object", "properties": {}}}),
        json!({"type": "function", "name": "Liam-check_packages",
            "description": "Check the current project's packages against the company-approved list and Nexus. Call it before adding a package and again before finishing.",
            "inputSchema": {"type": "object", "properties": {}}}),
    ]
}

/// Runs one of Liam's own tools. `None` when `name` is not one of them.
pub async fn call(name: &str, arguments: &Value, thread_id: &str) -> Option<(String, bool)> {
    let outcome = match name {
        "Liam-new_nextjs_project" => new_nextjs_project(arguments, thread_id).await,
        "Liam-check_packages" => check_packages(thread_id).await,
        "Liam-upgrade_project" => upgrade_project(thread_id).await,
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
        if entry.file_name() == ".complete" {
            continue; // the download marker of a cached template
        }
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

/// The newest template: from Nexus when it has a newer one than the bundled copy.
async fn source_dir() -> Result<PathBuf, String> {
    crate::template_source::newest(template_dir()).await.ok_or_else(|| "The Next.js template is missing from this installation.".to_string())
}

async fn new_nextjs_project(arguments: &Value, thread_id: &str) -> Result<String, String> {
    let template = source_dir().await?;
    new_nextjs_project_from(&template, arguments, thread_id)
}

fn new_nextjs_project_from(template: &Path, arguments: &Value, thread_id: &str) -> Result<String, String> {
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
    let mut created = Vec::new();
    copy_tree(template, &dir, &dir, &name, &mut created)?;
    created.sort();
    Ok(format!(
        "Created the Next.js project \"{name}\" in the project folder ({} files). Edit app/page.tsx to build the first screen; ready-made parts are in components/ui. Packages are already pinned and locked: do not run npm install. Call Liam-check_packages before finishing.",
        created.len()
    ))
}

// ---------------------------------------------------------------- upgrade

/// Adds the user bar to a root layout: the import and `<UserBar />` before the page content.
/// `None` when the layout already has it or has no `{children}` to put it before.
fn patch_layout(text: &str) -> Option<String> {
    if text.contains("UserBar") || !text.contains("{children}") {
        return None;
    }
    let import = "import { UserBar } from \"@/components/user-bar\";\n";
    // after the last import line when there are any, else at the top
    let mut offset = 0;
    let mut position = 0;
    for line in text.split_inclusive('\n') {
        offset += line.len();
        if line.trim_start().starts_with("import ") && line.trim_end().ends_with(';') {
            position = offset;
        }
    }
    let mut patched = String::with_capacity(text.len() + 80);
    patched.push_str(&text[..position]);
    patched.push_str(import);
    patched.push_str(&text[position..]);
    Some(patched.replacen("{children}", "<UserBar />\n        {children}", 1))
}

/// Adds `suppressHydrationWarning` to the `<html>` tag (the theme script changes its class before React loads).
/// `None` when it is already there or the layout has no plain `<html` tag.
fn allow_theme_on_html(text: &str) -> Option<String> {
    let start = text.find("<html")?;
    let end = start + text[start..].find('>')?;
    if text[start..end].contains("suppressHydrationWarning") {
        return None;
    }
    let mut patched = String::with_capacity(text.len() + 30);
    patched.push_str(&text[..start + "<html".len()]);
    patched.push_str(" suppressHydrationWarning");
    patched.push_str(&text[start + "<html".len()..]);
    Some(patched)
}

/// Brings the platform's files in `dir` up to date with the template in `source`. Those files belong to the
/// platform (not to the person's own screens): added when missing, replaced when an older copy is there.
/// Returns what changed (empty when nothing did).
fn upgrade_dir(dir: &Path, source: &Path) -> Result<Vec<String>, String> {
    if !dir.join("package.json").is_file() || !dir.join("app").is_dir() {
        return Err("This folder is not a Next.js project made from the company template (no package.json and app folder), so there is nothing to upgrade.".into());
    }
    let normalize = |text: &str| text.replace("\r\n", "\n");
    let mut done: Vec<String> = Vec::new();
    for relative in crate::template_source::platform_files(source) {
        let content = fs::read_to_string(source.join(&relative)).map_err(|e| format!("{relative}: {e}"))?;
        let target = dir.join(&relative);
        let existing = fs::read_to_string(&target).ok();
        if existing.as_deref().map(normalize) == Some(normalize(&content)) {
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, content).map_err(|e| e.to_string())?;
        done.push(format!("{} {relative}", if existing.is_some() { "updated" } else { "added" }));
    }
    let layout = dir.join("app").join("layout.tsx");
    let mut text = fs::read_to_string(&layout).map_err(|_| "app/layout.tsx is missing, so the user bar could not be added.".to_string())?;
    let mut layout_changed = false;
    match patch_layout(&text) {
        Some(patched) => {
            text = patched;
            layout_changed = true;
            done.push("added the user bar to app/layout.tsx".into());
        }
        None if text.contains("UserBar") => {}
        None => return Err("app/layout.tsx has no {children}, so the user bar could not be added. Add <UserBar /> (from @/components/user-bar) to the layout by hand.".into()),
    }
    // the theme script sets a class on <html> before the page loads
    if let Some(patched) = allow_theme_on_html(&text) {
        text = patched;
        layout_changed = true;
        done.push("allowed the theme on <html> in app/layout.tsx".into());
    }
    if layout_changed {
        fs::write(&layout, text).map_err(|e| e.to_string())?;
    }
    // record which template version the project now follows
    let marker = crate::template_source::MARKER;
    if let Ok(text) = fs::read_to_string(source.join(marker)) {
        if fs::read_to_string(dir.join(marker)).ok().as_deref().map(normalize) != Some(normalize(&text)) {
            fs::write(dir.join(marker), text).map_err(|e| e.to_string())?;
        }
    }
    Ok(done)
}

async fn upgrade_project(thread_id: &str) -> Result<String, String> {
    let dir = project_dir(thread_id)?;
    let source = source_dir().await?;
    let done = upgrade_dir(&dir, &source)?;
    Ok(if done.is_empty() {
        "The project is already up to date: it has getUser() and the user bar.".into()
    } else {
        format!("Upgraded the project: {}. The user's own screens were not changed. Deploy again to publish it.", done.join("; "))
    })
}

/// Called by the deploy tool before it saves the work: keeps the platform files current so a project made
/// long ago still gets sign-in fixes. Never fails the deploy; returns a note when something changed.
pub async fn refresh_platform(dir: &Path) -> Option<String> {
    if !dir.join(crate::template_source::MARKER).is_file() && !dir.join("lib").join("user.ts").is_file() {
        return None; // not made from the template (or too old to know): the upgrade tool does that on request
    }
    let source = source_dir().await.ok()?;
    let done = upgrade_dir(dir, &source).ok()?;
    (!done.is_empty()).then(|| format!("Platform files brought up to date first ({}).", done.join("; ")))
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
        THREADS.lock().unwrap().get_or_insert_with(HashMap::new).insert("t1".to_string(), dir.clone());
        let template = template_dir().unwrap();
        let message = new_nextjs_project_from(&template, &json!({"name": "demo-app"}), "t1").unwrap();
        assert!(message.contains("demo-app"));
        let package = fs::read_to_string(dir.join("package.json")).unwrap();
        assert!(package.contains("\"name\": \"demo-app\""));
        assert!(!package.contains("__NAME__"));
        assert!(dir.join(".npmrc").is_file(), "dotfiles are copied");
        assert!(dir.join("package-lock.json").is_file());
        // A second call must refuse: the folder is no longer empty.
        assert!(new_nextjs_project_from(&template, &json!({"name": "demo-app"}), "t1").is_err());
        assert!(dir.join(crate::template_source::MARKER).is_file(), "the project records its template version");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_older_layout_gets_the_user_bar_once() {
        let old = "import type { Metadata } from \"next\";\nimport \"./globals.css\";\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang=\"th\">\n      <body>{children}</body>\n    </html>\n  );\n}\n";
        let patched = patch_layout(old).expect("patched");
        assert!(patched.contains("import { UserBar } from \"@/components/user-bar\";"));
        assert!(patched.contains("<UserBar />\n        {children}"));
        // the import goes after the existing imports, before the component
        assert!(patched.find("UserBar }").unwrap() < patched.find("export default").unwrap());
        assert_eq!(patch_layout(&patched), None, "already patched: nothing more to do");
        let themed = allow_theme_on_html(&patched).expect("html tag patched");
        assert!(themed.contains("<html suppressHydrationWarning lang=\"th\">"));
        assert_eq!(allow_theme_on_html(&themed), None, "only once");
        assert_eq!(patch_layout("export default function X() { return null }"), None, "no children placeholder: cannot patch");
    }

    #[test]
    fn upgrading_adds_the_helper_files_and_is_safe_to_repeat() {
        let dir = std::env::temp_dir().join(format!("liam-upgrade-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("app")).unwrap();
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::write(dir.join("app/layout.tsx"), "import \"./globals.css\";\nexport default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n").unwrap();
        let template = template_dir().unwrap();
        let first = upgrade_dir(&dir, &template).unwrap().join("; ");
        assert!(first.contains("lib/user.ts") && first.contains("layout.tsx"));
        assert!(dir.join("lib/user.ts").is_file() && dir.join("components/user-bar.tsx").is_file());
        assert!(fs::read_to_string(dir.join("app/layout.tsx")).unwrap().contains("<UserBar />"));
        assert_eq!(crate::template_source::version_of(&dir), crate::template_source::version_of(&template), "the version is recorded");
        assert!(upgrade_dir(&dir, &template).unwrap().is_empty(), "nothing left to do the second time");
        // an older copy of a platform file is brought up to date
        fs::write(dir.join("lib/user.ts"), "// old copy\n").unwrap();
        assert_eq!(upgrade_dir(&dir, &template).unwrap(), vec!["updated lib/user.ts".to_string()]);
        assert_eq!(fs::read_to_string(dir.join("lib/user.ts")).unwrap(), fs::read_to_string(template.join("lib/user.ts")).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }
}
