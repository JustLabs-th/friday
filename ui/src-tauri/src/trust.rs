//! Trust for the company root CA, kept inside Liam.
//!
//! The root CA ships with the app. Liam trusts it for its own connections and hands it to the engine
//! and to the tools the agent runs, so nothing is written to the Windows certificate store and no
//! administrator rights are needed. Normal certificate and host name checks stay on; the CA is only
//! added to what is trusted. Before use the file is checked against the expected SHA-256 fingerprint.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::OnceLock};

/// SHA-256 of the SRT AI Platform Root CA certificate (DER).
const FINGERPRINT: &str = "AD47DC6DCF17D3637BBFB56976D8546F7160C4379C55107CFD0E7D00353847EF";

struct Ca {
    path: PathBuf,
    der: Vec<u8>,
}

static CA: OnceLock<Option<Ca>> = OnceLock::new();

fn locate() -> Option<PathBuf> {
    let name = "srt-platform-root-ca.crt";
    let beside = std::env::current_exe()
        .ok()?
        .parent()?
        .join("installer")
        .join(name);
    if beside.is_file() {
        return Some(beside);
    }
    // Development runs use the copy in the source tree.
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("installer").join(name);
    source.is_file().then_some(source)
}

fn load() -> Option<Ca> {
    let path = locate()?;
    let text = std::fs::read_to_string(&path).ok()?;
    let body: String = text
        .lines()
        .skip_while(|line| !line.starts_with("-----BEGIN CERTIFICATE"))
        .skip(1)
        .take_while(|line| !line.starts_with("-----END"))
        .collect();
    let der = STANDARD.decode(body.trim()).ok()?;
    let actual: String = Sha256::digest(&der).iter().map(|b| format!("{b:02X}")).collect();
    (actual == FINGERPRINT.replace(' ', "")).then_some(Ca { path, der })
}

fn ca() -> Option<&'static Ca> {
    CA.get_or_init(load).as_ref()
}

/// Windows certificate stores (a browser uses these, unlike Liam itself, which reads the file above).
/// SSO sign-in opens the system browser, so the CA has to be there too or it shows a security warning.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTrust {
    /// The bundled CA is present and valid, so it can be installed.
    available: bool,
    /// The CA is already trusted by Windows (for this user or the whole PC).
    trusted: bool,
}

fn certutil(args: &[&str]) -> Option<std::process::Output> {
    let mut command = std::process::Command::new("certutil.exe");
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.output().ok()
}

/// Whether Windows lists the certificate. certutil's exit code does not say (it succeeds for any
/// hash), so the certificate's SHA-1 is looked for in the listing; hex digits do not depend on language.
fn windows_trusts(ca: &Ca) -> bool {
    use sha1::Sha1;
    let wanted: String = Sha1::digest(&ca.der).iter().map(|b| format!("{b:02x}")).collect();
    [&["-user", "-store", "Root"][..], &["-store", "Root"][..]].iter().any(|args| {
        certutil(args).is_some_and(|out| {
            String::from_utf8_lossy(&out.stdout).to_lowercase().replace(' ', "").contains(&wanted)
        })
    })
}

#[tauri::command]
pub async fn trust_status() -> BrowserTrust {
    tauri::async_runtime::spawn_blocking(|| match ca() {
        Some(ca) => BrowserTrust { available: true, trusted: windows_trusts(ca) },
        None => BrowserTrust { available: false, trusted: false },
    })
    .await
    .unwrap_or(BrowserTrust { available: false, trusted: false })
}

/// Adds the company CA to the current user's store. No administrator rights; Windows asks the person
/// to confirm. The file was verified against the expected fingerprint when it was loaded.
#[tauri::command]
pub async fn trust_install() -> Result<BrowserTrust, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ca = ca().ok_or("The company certificate is missing from this installation.")?;
        let path = ca.path.to_string_lossy().trim_start_matches("\\\\?\\").to_string();
        let out = certutil(&["-user", "-addstore", "-f", "Root", &path]).ok_or("Cannot run certutil.")?;
        if !out.status.success() {
            return Err("The certificate was not installed (it may have been declined).".to_string());
        }
        Ok(BrowserTrust { available: true, trusted: windows_trusts(ca) })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// An HTTP client builder that also trusts the company root CA.
pub fn http_builder() -> reqwest::ClientBuilder {
    let builder = reqwest::Client::builder();
    match ca().and_then(|ca| reqwest::Certificate::from_der(&ca.der).ok()) {
        Some(certificate) => builder.add_root_certificate(certificate),
        None => builder,
    }
}

/// Environment for the engine and the tools the agent runs (npm, pip, git, Node), so they trust the
/// company CA too. Empty when the bundled CA is missing or does not match the expected fingerprint.
pub fn tool_env() -> Vec<(&'static str, String)> {
    let Some(ca) = ca() else {
        return Vec::new();
    };
    let path = ca.path.to_string_lossy().trim_start_matches("\\\\?\\").to_string();
    vec![
        ("CODEX_CA_CERTIFICATE", path.clone()),
        ("NODE_EXTRA_CA_CERTS", path.clone()),
        ("npm_config_cafile", path.clone()),
        ("PIP_CERT", path.clone()),
        // git: use the file even with the Windows (schannel) backend.
        ("GIT_CONFIG_COUNT", "2".into()),
        ("GIT_CONFIG_KEY_0", "http.sslCAInfo".into()),
        ("GIT_CONFIG_VALUE_0", path),
        ("GIT_CONFIG_KEY_1", "http.schannelUseSSLCAInfo".into()),
        ("GIT_CONFIG_VALUE_1", "true".into()),
    ]
}

/// The CA file, for git commands that set their own configuration.
pub fn ca_file() -> Option<String> {
    ca().map(|ca| ca.path.to_string_lossy().trim_start_matches("\\\\?\\").to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_shipped_ca_matches_the_expected_fingerprint() {
        assert!(super::ca().is_some(), "installer/srt-platform-root-ca.crt is missing or does not match");
        assert!(!super::tool_env().is_empty());
    }

    /// Depends on this PC's certificate store, so it is run by hand: `cargo test windows_trust -- --ignored`.
    #[test]
    #[ignore]
    fn windows_trust_is_detected_on_this_pc() {
        let ca = super::ca().expect("ca");
        println!("trusted by Windows: {}", super::windows_trusts(ca));
        assert!(super::windows_trusts(ca));
    }
}
