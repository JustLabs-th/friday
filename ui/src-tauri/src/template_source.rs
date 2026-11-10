//! Where the Next.js project template comes from.
//!
//! The newest template lives in Nexus (raw-tools/templates/nextjs, published with scripts/publish-template.py),
//! so it can be updated without releasing a new Liam. A copy of an older template is bundled in the app and
//! used when Nexus cannot be reached or has nothing newer.
//!
//!   templates/nextjs/latest.json          {"version": 3}
//!   templates/nextjs/v3/manifest.json     {"version": 3, "files": [{"path": "...", "sha256": "..."}]}
//!   templates/nextjs/v3/files/<path>      every file of the template
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

const REMOTE: &str = "https://nexus.digitalx.srt/repository/raw-tools/templates/nextjs/";
/// The file in a template (and in every project made from it) that says which template version it is.
pub const MARKER: &str = "template.json";

fn cache_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Liam")
        .join("template-cache")
}

/// The template version recorded in `dir` (0 when it has none).
pub fn version_of(dir: &Path) -> u64 {
    fs::read_to_string(dir.join(MARKER))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|marker| marker["version"].as_u64())
        .unwrap_or(0)
}

/// The files of a template that belong to the platform (not to the person's own screens).
pub fn platform_files(dir: &Path) -> Vec<String> {
    let listed: Vec<String> = fs::read_to_string(dir.join(MARKER))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|marker| marker["platform"].as_array().cloned())
        .map(|items| items.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if listed.is_empty() {
        vec!["lib/user.ts".into(), "components/user-bar.tsx".into()]
    } else {
        listed
    }
}

fn safe(path: &str) -> bool {
    !path.is_empty() && !path.starts_with('/') && !path.contains('\\') && !path.split('/').any(|part| part == ".." || part.is_empty())
}

async fn get(http: &reqwest::Client, path: &str) -> Result<Vec<u8>, String> {
    let response = http.get(format!("{REMOTE}{path}")).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("{path}: {}", response.status()));
    }
    response.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
}

/// Downloads template version `version` into the cache (every file checked against its checksum).
async fn download(http: &reqwest::Client, version: u64) -> Result<PathBuf, String> {
    let target = cache_root().join(format!("v{version}"));
    if target.join(".complete").is_file() {
        return Ok(target);
    }
    let manifest: Value = serde_json::from_slice(&get(http, &format!("v{version}/manifest.json")).await?).map_err(|e| e.to_string())?;
    let part = cache_root().join(format!("v{version}.part"));
    let _ = fs::remove_dir_all(&part);
    for file in manifest["files"].as_array().ok_or("The template list is empty.")? {
        let path = file["path"].as_str().unwrap_or("");
        if !safe(path) {
            return Err(format!("The template lists an unsafe path: {path}"));
        }
        let bytes = get(http, &format!("v{version}/files/{path}")).await?;
        let sum = format!("{:x}", Sha256::digest(&bytes));
        if Some(sum.as_str()) != file["sha256"].as_str() {
            return Err(format!("{path}: the checksum does not match."));
        }
        let destination = part.join(path);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&destination, &bytes).map_err(|e| e.to_string())?;
    }
    fs::write(part.join(".complete"), "ok").map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&target);
    fs::rename(&part, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

/// The newest template folder: the one from Nexus when it is newer than the bundled copy, else the bundled one.
pub async fn newest(bundled: Option<PathBuf>) -> Option<PathBuf> {
    let have = bundled.as_deref().map(version_of).unwrap_or(0);
    let remote = async {
        let http = crate::trust::http_builder().timeout(Duration::from_secs(8)).build().map_err(|e| e.to_string())?;
        let latest: Value = serde_json::from_slice(&get(&http, "latest.json").await?).map_err(|e| e.to_string())?;
        let version = latest["version"].as_u64().ok_or("latest.json has no version")?;
        if version <= have {
            return Ok::<Option<PathBuf>, String>(None);
        }
        download(&http, version).await.map(Some)
    }
    .await;
    match remote {
        Ok(Some(dir)) => Some(dir),
        Ok(None) => bundled,
        Err(error) => {
            eprintln!("template: using the bundled copy ({error})");
            bundled
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_must_stay_inside_the_template() {
        assert!(safe("lib/user.ts"));
        assert!(!safe("../x"));
        assert!(!safe("/etc/passwd"));
        assert!(!safe("a//b"));
        assert!(!safe("a\\b"));
    }

    #[test]
    fn the_bundled_template_has_a_version_and_platform_files() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates").join("nextjs");
        assert!(version_of(&dir) >= 1);
        let files = platform_files(&dir);
        assert!(files.contains(&"lib/user.ts".to_string()));
        assert!(files.iter().all(|f| dir.join(f).is_file()), "every platform file exists in the template");
    }
}
