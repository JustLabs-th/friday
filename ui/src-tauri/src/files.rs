//! Opening a file the agent made (a page, a report) from a link in the conversation.
//!
//! Only documents and media open: anything that could run (programs, scripts, shortcuts) is refused,
//! because the link text comes from the model.
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const OPENABLE: &[&str] = &[
    "html", "htm", "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "md", "csv", "json", "xlsx", "xls",
    "docx", "doc", "pptx", "ppt",
];

/// A link target as the page sees it (`/E:/work/a%20b.html`, `E:\work\a.html`, `file:///E:/...`) to a path.
fn local_path(link: &str) -> Option<PathBuf> {
    let text = link.trim().replace('\\', "/");
    let url = if let Some(rest) = text.strip_prefix("file://") {
        format!("file://{rest}")
    } else if text.len() > 2 && text.as_bytes()[1] == b':' {
        format!("file:///{text}")
    } else if text.starts_with('/') {
        format!("file://{text}")
    } else {
        return None;
    };
    url::Url::parse(&url).ok()?.to_file_path().ok()
}

#[tauri::command]
pub fn open_local_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = local_path(&path).ok_or("That is not a file on this computer.")?;
    let path = path.canonicalize().map_err(|_| "The file does not exist.".to_string())?;
    if !path.is_file() {
        return Err("That is not a file.".into());
    }
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !OPENABLE.contains(&extension.as_str()) {
        return Err(format!("Liam does not open .{extension} files."));
    }
    let text = path.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    app.opener().open_path(text, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::local_path;

    #[test]
    fn understands_the_link_shapes_the_page_produces() {
        let expected = local_path(r"E:\work\a b.html").unwrap();
        assert_eq!(local_path("/E:/work/a%20b.html").unwrap(), expected);
        assert_eq!(local_path("file:///E:/work/a%20b.html").unwrap(), expected);
        assert!(local_path("index.html").is_none());
        assert!(local_path("https://example.com").is_none());
    }
}
