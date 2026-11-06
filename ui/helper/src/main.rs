//! Run by the Liam installer (as administrator): point the company service names at their servers.
//! It is a plain program rather than a script because endpoint protection on company PCs blocks
//! PowerShell. Liam trusts the company root CA inside the app, so the Windows certificate store is
//! only touched when asked (`--with-ca`, for browsers on that PC).
//!
//!   liam-setup install   [--hosts <file>] [--with-ca [--ca <file>]]
//!   liam-setup uninstall [--hosts <file>]
//!
//! Safe to run again. `uninstall` removes only the hosts block; a CA that was added stays because
//! other company tools rely on it. A log is written next to this program.
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

/// Only the names Liam uses. Edit here to add more.
const RECORDS: &[(&str, &str)] = &[
    ("sso.digitalx.srt", "192.168.100.3"),
    ("bifrost.digitalx.srt", "192.168.100.9"),
    ("key-portal.digitalx.srt", "192.168.100.9"),
    ("coolify.digitalx.srt", "192.168.100.9"),
    ("home.digitalx.srt", "192.168.100.9"),
    ("git.digitalx.srt", "192.168.100.7"),
    ("nexus.digitalx.srt", "192.168.100.24"),
    ("registry.digitalx.srt", "192.168.100.24"),
];
const BEGIN: &str = "# >>> Liam company hosts (managed by the Liam installer)";
const END: &str = "# <<< Liam company hosts";

fn is_ours(name: &str) -> bool {
    RECORDS.iter().any(|(n, _)| n.eq_ignore_ascii_case(name))
}

/// The hosts text with Liam's block removed and, when `add`, written again at the end. A name that is
/// listed elsewhere (possibly with another address) is taken off that line so nothing conflicts.
fn rewrite(text: &str, add: bool) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut inside = false;
    for line in text.lines() {
        if line == BEGIN {
            inside = true;
            continue;
        }
        if line == END {
            inside = false;
            continue;
        }
        if inside {
            continue;
        }
        if add {
            let (code, comment) = match line.split_once('#') {
                Some((code, comment)) => (code, Some(comment)),
                None => (line, None),
            };
            let fields: Vec<&str> = code.split_whitespace().collect();
            if fields.len() >= 2 {
                let kept: Vec<&str> = fields[1..].iter().copied().filter(|n| !is_ours(n)).collect();
                if kept.len() != fields.len() - 1 {
                    if !kept.is_empty() {
                        let tail = comment.map(|c| format!(" #{c}")).unwrap_or_default();
                        out.push(format!("{} {}{}", fields[0], kept.join(" "), tail));
                    } else if let Some(c) = comment {
                        out.push(format!("#{c}"));
                    }
                    continue;
                }
            }
        }
        out.push(line.to_string());
    }
    if add {
        out.push(BEGIN.into());
        out.extend(RECORDS.iter().map(|(name, ip)| format!("{ip} {name}")));
        out.push(END.into());
    }
    out.join("\r\n") + "\r\n"
}

fn update_hosts(path: &Path, add: bool) -> Result<bool, String> {
    let original = fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let original = String::from_utf8_lossy(&original).into_owned();
    let updated = rewrite(&original, add);
    if updated == original {
        return Ok(false);
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let mut backup = path.as_os_str().to_owned();
    backup.push(format!(".liam-{stamp}.bak"));
    fs::copy(path, PathBuf::from(backup)).map_err(|e| format!("cannot back up hosts: {e}"))?;
    fs::write(path, updated).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    Ok(true)
}

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(program).args(args).output().map_err(|e| format!("{program}: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Err(format!("{program} failed ({}): {}", output.status, text.trim()))
}

fn main() {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));
    let log_path = exe_dir.join("network-setup.log");
    let log = |text: &str| {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let mut old = fs::read_to_string(&log_path).unwrap_or_default();
        old.push_str(&format!("[{stamp}] {text}\r\n"));
        let _ = fs::write(&log_path, old);
        println!("{text}");
    };

    let args: Vec<String> = std::env::args().skip(1).collect();
    let action = args.first().map(String::as_str).unwrap_or("install");
    let value = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1)).cloned();
    let hosts = value("--hosts").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into()))
            .join(r"System32\drivers\etc\hosts")
    });
    let ca = value("--ca").map(PathBuf::from).unwrap_or_else(|| exe_dir.join("srt-platform-root-ca.crt"));
    let with_ca = args.iter().any(|a| a == "--with-ca");

    let result = (|| -> Result<(), String> {
        match action {
            "install" => {
                if with_ca {
                    if !ca.is_file() {
                        return Err(format!("root CA not found: {}", ca.display()));
                    }
                    run("certutil.exe", &["-addstore", "-f", "Root", &ca.to_string_lossy()])?;
                    log("root CA trusted");
                }
                let changed = update_hosts(&hosts, true)?;
                log(if changed { "hosts updated" } else { "hosts already up to date" });
            }
            "uninstall" => {
                update_hosts(&hosts, false)?;
                log("hosts block removed");
            }
            other => return Err(format!("unknown action: {other}")),
        }
        {
            let _ = run("ipconfig.exe", &["/flushdns"]);
        }
        Ok(())
    })();
    if let Err(error) = result {
        log(&format!("FAILED: {error}"));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_block_moves_conflicts_and_is_idempotent() {
        let before = "127.0.0.1 localhost\r\n10.0.0.1 sso.digitalx.srt other.example # keep me\r\n192.168.100.24 nexus.digitalx.srt\r\n";
        let once = rewrite(before, true);
        assert!(once.contains("10.0.0.1 other.example # keep me"));
        assert!(once.contains("192.168.100.3 sso.digitalx.srt"));
        assert_eq!(once.matches("nexus.digitalx.srt").count(), 1);
        assert_eq!(rewrite(&once, true), once);
        let removed = rewrite(&once, false);
        assert!(!removed.contains("Liam"));
        assert!(removed.contains("127.0.0.1 localhost"));
        assert!(removed.contains("other.example"));
    }
}
