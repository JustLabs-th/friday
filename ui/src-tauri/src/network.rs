//! Lets the person's browser open the company's own addresses.
//!
//! Many company PCs send every web address through a proxy (Squid), and the proxy cannot resolve the
//! internal names (`*.digitalx.srt`), so an app Liam put online shows the proxy's error page. The
//! proxy's list of exceptions ("do not use the proxy for...") decides; this adds `*.digitalx.srt` to
//! it, for this user only, once. Nothing changes when there is no proxy, when a proxy script (PAC)
//! decides instead, or when `LIAM_NO_NETWORK_FIX` is set.
use std::process::Command;

const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";
const BYPASS: &str = "*.digitalx.srt";

/// The exceptions list with the company names added, or `None` when they are already covered.
pub fn with_bypass(existing: &str) -> Option<String> {
    let entries: Vec<&str> = existing.split(';').map(str::trim).filter(|e| !e.is_empty()).collect();
    let covered = entries.iter().any(|e| {
        let e = e.to_ascii_lowercase();
        e == BYPASS || e == "*.srt" || e == ".digitalx.srt" || e == "*digitalx.srt"
    });
    if covered {
        return None;
    }
    // "<local>" is a marker, not a name; keep it last as Windows writes it.
    let (local, rest): (Vec<&str>, Vec<&str>) = entries.into_iter().partition(|e| e.eq_ignore_ascii_case("<local>"));
    let mut all: Vec<&str> = rest;
    all.push(BYPASS);
    all.extend(local);
    Some(all.join(";"))
}

/// The text of one value from `reg query` output (`    Name    REG_SZ    data`).
fn reg_value(output: &str, name: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let text = line.trim();
        let (found, rest) = text.split_once(char::is_whitespace)?;
        if !found.eq_ignore_ascii_case(name) {
            return None;
        }
        // `REG_SZ    data`: skip the type, keep the data (it may hold spaces).
        let rest = rest.trim_start();
        let data = match rest.split_once(char::is_whitespace) {
            Some((kind, data)) if kind.starts_with("REG_") => data.trim(),
            _ => "",
        };
        Some(data.to_string())
    })
}

fn reg(args: &[&str]) -> Option<String> {
    let mut command = Command::new("reg.exe");
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Adds the company names to the proxy exceptions of this user, when a plain proxy is in use. Returns what happened.
#[cfg(windows)]
pub fn fix_proxy_bypass() -> String {
    if std::env::var_os("LIAM_NO_NETWORK_FIX").is_some() {
        return "network fix switched off".into();
    }
    let Some(settings) = reg(&["query", KEY]) else { return "could not read the proxy settings".into() };
    let enabled = reg_value(&settings, "ProxyEnable").is_some_and(|v| v == "0x1");
    if !enabled {
        return "no proxy in use".into();
    }
    if reg_value(&settings, "AutoConfigURL").is_some_and(|v| !v.is_empty()) {
        return "a proxy script decides; left alone".into();
    }
    let existing = reg_value(&settings, "ProxyOverride").unwrap_or_default();
    match with_bypass(&existing) {
        None => "proxy exceptions already cover the company names".into(),
        Some(updated) => {
            if reg(&["add", KEY, "/v", "ProxyOverride", "/t", "REG_SZ", "/d", &updated, "/f"]).is_some() {
                format!("added {BYPASS} to the proxy exceptions")
            } else {
                "could not write the proxy exceptions".into()
            }
        }
    }
}

#[cfg(not(windows))]
pub fn fix_proxy_bypass() -> String {
    "not Windows".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_the_company_names_before_local() {
        assert_eq!(
            with_bypass("localhost;127.0.0.1;192.168.*;*.local;*.dxfa.srt;<local>").as_deref(),
            Some("localhost;127.0.0.1;192.168.*;*.local;*.dxfa.srt;*.digitalx.srt;<local>")
        );
        assert_eq!(with_bypass("").as_deref(), Some("*.digitalx.srt"));
    }

    #[test]
    fn leaves_a_list_that_already_covers_the_names() {
        assert_eq!(with_bypass("localhost;*.digitalx.srt;<local>"), None);
        assert_eq!(with_bypass("*.srt"), None);
    }

    #[test]
    fn reads_a_value_from_reg_query_output() {
        let out = "\r\nHKEY_CURRENT_USER\\Software\\X\r\n    ProxyEnable    REG_DWORD    0x1\r\n    ProxyOverride    REG_SZ    localhost;<local>\r\n";
        assert_eq!(reg_value(out, "ProxyEnable").as_deref(), Some("0x1"));
        assert_eq!(reg_value(out, "ProxyOverride").as_deref(), Some("localhost;<local>"));
        assert_eq!(reg_value(out, "AutoConfigURL"), None);
    }
}
