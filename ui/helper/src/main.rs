//! Run by the Liam installer (as administrator): point the company service names at their servers.
//! It is a plain program rather than a script because endpoint protection on company PCs blocks
//! PowerShell. Liam trusts the company root CA inside the app, so the Windows certificate store is
//! only touched when asked (`--with-ca`, for browsers on that PC).
//!
//!   liam-setup install   [--hosts <file>] [--with-ca [--ca <file>]] [--dns <ip> | --no-dns]
//!   liam-setup uninstall [--hosts <file>]
//!
//! `install` also adds a DNS rule so names under digitalx.srt (the apps Liam puts online have wildcard names a
//! hosts file cannot hold) are asked of the company DNS server; nothing else about the PC's DNS changes.
//! Safe to run again. `uninstall` removes the hosts block and that rule; a CA that was added stays because
//! other company tools rely on it. A log is written next to this program.
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

/// The company service names and where they live (the list the platform team maintains).
const RECORDS: &[(&str, &str)] = &[
    ("sso.digitalx.srt", "192.168.100.3"),
    ("home.digitalx.srt", "192.168.100.9"),
    ("coolify.digitalx.srt", "192.168.100.9"),
    ("key-portal.digitalx.srt", "192.168.100.9"),
    ("bifrost.digitalx.srt", "192.168.100.9"),
    ("ragflow.digitalx.srt", "192.168.100.9"),
    ("git.digitalx.srt", "192.168.100.7"),
    ("nexus.digitalx.srt", "192.168.100.24"),
    ("registry.digitalx.srt", "192.168.100.24"),
    ("ai.dxfa.srt", "192.168.100.9"),
    ("backend.dxfa.srt", "192.168.100.9"),
    ("iam.dxfa.srt", "192.168.100.9"),
    ("llm.dxfa.srt", "192.168.100.9"),
    ("tianyan.ai", "192.168.100.9"),
    ("digitaltransformation-fa.srt", "192.168.100.9"),
    ("backend.digitaltransformation-fa.srt", "192.168.100.9"),
    ("test.digitaltransformation-fa.srt", "192.168.100.9"),
    ("peeko.ai", "192.168.100.9"),
    ("admin-digitaltransformation-fa.srt", "192.168.100.9"),
    ("git.dxfa.srt", "192.168.100.7"),
    ("git.digitaltransformation-fa.srt", "192.168.100.7"),
    ("registry.dxfa.srt", "192.168.100.24"),
    ("registry.digitaltransformation-fa.srt", "192.168.100.24"),
    ("db.tianyan.ai", "192.168.100.4"),
    ("core.tianyan.ai", "192.168.100.5"),
    ("frontend.digitaltransformation-fa.srt", "192.168.100.6"),
    ("nas.tianyan.ai", "192.168.100.10"),
    ("agent.tianyan.ai", "192.168.100.13"),
    ("lot.digitaltransformation-fa.srt", "192.168.100.14"),
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

/// The company DNS server (Technitium). It answers the company's own names, including every app Liam puts
/// online (`<name>.apps.digitalx.srt`), which a hosts file cannot do because it has no wildcards.
const COMPANY_DNS: &str = "192.168.100.9";
const NRPT_KEY: &str = r"HKLM\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient\DnsPolicyConfig\{6c1a0e2a-7b1f-4d55-9e3a-114a5c0e0001}";

/// The `reg.exe` calls that make Windows ask `dns` for names under digitalx.srt (a name resolution policy rule).
/// Only those names are sent there: the PC's own DNS stays in charge of everything else, and the hosts file
/// is still looked at first, so the listed company names keep working even when that server is away.
fn dns_rule_commands(dns: &str, add: bool) -> Vec<Vec<String>> {
    let reg = |parts: &[&str]| parts.iter().map(|p| p.to_string()).collect::<Vec<_>>();
    if !add {
        return vec![reg(&["delete", NRPT_KEY, "/f"])];
    }
    vec![
        reg(&["add", NRPT_KEY, "/v", "Name", "/t", "REG_MULTI_SZ", "/d", ".digitalx.srt", "/f"]),
        reg(&["add", NRPT_KEY, "/v", "Version", "/t", "REG_DWORD", "/d", "2", "/f"]),
        reg(&["add", NRPT_KEY, "/v", "ConfigOptions", "/t", "REG_DWORD", "/d", "8", "/f"]),
        reg(&["add", NRPT_KEY, "/v", "GenericDNSServers", "/t", "REG_SZ", "/d", dns, "/f"]),
    ]
}

fn apply_dns_rule(dns: &str, add: bool) -> Result<(), String> {
    for command in dns_rule_commands(dns, add) {
        let args: Vec<&str> = command.iter().map(String::as_str).collect();
        // Removing a rule that was never added is fine.
        if let Err(error) = run("reg.exe", &args) {
            if add {
                return Err(error);
            }
        }
    }
    // Ask the DNS client to read the rule now (best effort; it also reads it at the next start).
    let _ = run("sc.exe", &["control", "dnscache", "paramchange"]);
    Ok(())
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
    let no_dns = args.iter().any(|a| a == "--no-dns");
    let dns = value("--dns").unwrap_or_else(|| COMPANY_DNS.to_string());

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
                if !no_dns {
                    // Not fatal: the company names in the hosts file already work without it.
                    match apply_dns_rule(&dns, true) {
                        Ok(()) => log(&format!("names under digitalx.srt are asked of {dns}")),
                        Err(error) => log(&format!("DNS rule not added: {error}")),
                    }
                }
            }
            "uninstall" => {
                update_hosts(&hosts, false)?;
                log("hosts block removed");
                let _ = apply_dns_rule(&dns, false);
                log("DNS rule removed");
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
    fn the_dns_rule_covers_only_company_names() {
        let add = dns_rule_commands("192.168.100.9", true);
        let text: Vec<String> = add.iter().map(|c| c.join(" ")).collect();
        assert!(text.iter().any(|c| c.contains("/v Name") && c.contains(".digitalx.srt")));
        assert!(text.iter().any(|c| c.contains("GenericDNSServers") && c.contains("192.168.100.9")));
        assert!(text.iter().any(|c| c.contains("ConfigOptions") && c.contains("/d 8")));
        assert!(text.iter().all(|c| c.contains(r"DnsPolicyConfig\{")), "only the Liam rule is touched");
        let remove = dns_rule_commands("192.168.100.9", false);
        assert_eq!(remove.len(), 1);
        assert_eq!(remove[0][0], "delete");
    }

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
