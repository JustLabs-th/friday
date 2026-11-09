//! What a chat has changed in its project folder, for the "Changes" box in the side panel.
//!
//! The agent writes files through the shell, so there is no list of edits to add up; the folder itself
//! is compared with how it looked when the chat's first request started.
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

/// Git's built-in empty tree: the starting point for a folder that was not a repository yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const SKIP_DIRS: &[&str] = &[".git", "node_modules", ".next", "dist", "build", "target", ".venv", "__pycache__"];

static BASELINES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    added: u32,
    removed: u32,
    files: u32,
    /// The files themselves (relative paths, at most `MAX_NAMES`), for the "Outputs" list.
    names: Vec<String>,
}

const MAX_NAMES: usize = 200;

impl Changes {
    fn note(&mut self, name: &str) {
        if self.names.len() < MAX_NAMES {
            self.names.push(name.replace('\\', "/"));
        }
    }
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new("git");
    command.args(["-c", "core.quotepath=false"]).args(args).current_dir(dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Remembers how the folder looked when a chat's first request started (once per chat).
pub fn note_baseline(thread_id: &str, dir: &Path) {
    let Ok(mut guard) = BASELINES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    if map.contains_key(thread_id) {
        return;
    }
    let base = git(dir, &["rev-parse", "--verify", "HEAD"])
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| EMPTY_TREE.to_string());
    map.insert(thread_id.to_string(), base);
}

fn count_lines(path: &Path) -> u32 {
    let Ok(meta) = fs::metadata(path) else { return 0 };
    if meta.len() > 512 * 1024 {
        return 0;
    }
    let Ok(bytes) = fs::read(path) else { return 0 };
    if bytes.contains(&0) {
        return 0;
    }
    let newlines = bytes.iter().filter(|b| **b == b'\n').count() as u32;
    newlines + u32::from(bytes.last().is_some_and(|b| *b != b'\n'))
}

/// Lines in every file of a folder that is not a repository yet.
fn walk(dir: &Path, root: &Path, depth: u32, changes: &mut Changes) {
    if depth > 8 || changes.files > 5000 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) {
                walk(&path, root, depth + 1, changes);
            }
        } else {
            changes.files += 1;
            changes.added += count_lines(&path);
            changes.note(&path.strip_prefix(root).unwrap_or(&path).to_string_lossy());
        }
    }
}

fn compute(dir: &Path, base: &str) -> Changes {
    let mut changes = Changes::default();
    if git(dir, &["rev-parse", "--is-inside-work-tree"]).is_none() {
        walk(dir, dir, 0, &mut changes);
        return changes;
    }
    // Names of files changed since the baseline (deleted ones are counted but not listed: there is nothing to open).
    let present: Vec<String> = git(dir, &["diff", "--name-only", "--diff-filter=d", base])
        .map(|text| text.lines().filter(|l| !l.is_empty()).map(str::to_string).collect())
        .unwrap_or_default();
    if let Some(stat) = git(dir, &["diff", "--numstat", base]) {
        for line in stat.lines() {
            let mut parts = line.split('\t');
            let (added, removed) = (parts.next().unwrap_or("-"), parts.next().unwrap_or("-"));
            changes.added += added.parse::<u32>().unwrap_or(0);
            changes.removed += removed.parse::<u32>().unwrap_or(0);
            changes.files += 1;
        }
    }
    for name in &present {
        changes.note(name);
    }
    if let Some(untracked) = git(dir, &["ls-files", "--others", "--exclude-standard"]) {
        for name in untracked.lines().filter(|l| !l.is_empty()) {
            changes.files += 1;
            changes.added += count_lines(&dir.join(name));
            changes.note(name);
        }
    }
    changes
}

#[tauri::command]
pub async fn git_changes(thread_id: String) -> Result<Changes, String> {
    let dir: PathBuf = crate::platform_tools::thread_dir(&thread_id).ok_or("Unknown chat folder")?;
    tauri::async_runtime::spawn_blocking(move || {
        note_baseline(&thread_id, &dir);
        let base = BASELINES
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().and_then(|map| map.get(&thread_id).cloned()))
            .unwrap_or_else(|| EMPTY_TREE.to_string());
        compute(&dir, &base)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_lines_of_text_and_skips_binary() {
        let dir = std::env::temp_dir().join(format!("liam-changes-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::write(dir.join("a.txt"), "one\ntwo\nthree").unwrap();
        fs::write(dir.join("b.bin"), [1u8, 0, 2]).unwrap();
        fs::write(dir.join("node_modules").join("x.js"), "ignored\n").unwrap();
        let changes = compute(&dir, EMPTY_TREE);
        assert_eq!(changes.files, 2);
        assert_eq!(changes.added, 3);
        let mut names = changes.names.clone();
        names.sort();
        assert_eq!(names, vec!["a.txt".to_string(), "b.bin".to_string()], "the files are listed, node_modules is not");
        let _ = fs::remove_dir_all(&dir);
    }
}
