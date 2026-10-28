//! What an app release looks like to Abyss (docs/RELEASE_STANDARD.md): a GitHub release whose
//! `latest.json` is Tauri's updater manifest, next to the installer, its `.sig` and `SHA256SUMS.txt`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::catalog::CatalogApp;
use crate::http;

/// Key of the Windows installer in `latest.json` → `platforms`.
pub const PLATFORM: &str = "windows-x86_64";
pub const CHECKSUMS_FILE: &str = "SHA256SUMS.txt";

#[derive(Debug, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub pub_date: Option<String>,
    pub platforms: HashMap<String, PlatformAsset>,
}

#[derive(Debug, Deserialize)]
pub struct PlatformAsset {
    pub signature: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestRelease {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub url: String,
    #[serde(skip)]
    pub signature: String,
}

pub fn manifest_url(app: &CatalogApp) -> Option<String> {
    let custom = app.install.as_ref().and_then(|i| i.manifest.clone());
    custom.or_else(|| app.repo.as_ref().map(|r| format!("https://github.com/{r}/releases/latest/download/latest.json")))
}

pub fn parse_manifest(text: &str) -> Result<LatestRelease, String> {
    let m: UpdateManifest = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("latest.json is not valid: {e}"))?;
    let asset = m.platforms.get(PLATFORM).ok_or_else(|| format!("Release {} has no {PLATFORM} installer", m.version))?;
    Ok(LatestRelease {
        version: m.version.trim_start_matches('v').to_string(),
        notes: m.notes.filter(|n| !n.trim().is_empty()),
        pub_date: m.pub_date,
        url: asset.url.clone(),
        signature: asset.signature.clone(),
    })
}

pub async fn fetch_latest(app: &CatalogApp) -> Result<LatestRelease, String> {
    let url = manifest_url(app).ok_or_else(|| format!("{} has no release source", app.name))?;
    let text = http::get_text_opt(&url).await?.ok_or_else(|| format!("{} has no published release yet", app.name))?;
    parse_manifest(&text)
}

/// `SHA256SUMS.txt` in the same release folder as `asset_url`.
pub fn sibling_url(asset_url: &str, file: &str) -> String {
    match asset_url.rfind(['/', '\\']) {
        Some(i) => format!("{}{file}", &asset_url[..=i]),
        None => file.to_string(),
    }
}

pub fn file_name(url: &str) -> String {
    let name = url.rsplit(['/', '\\']).next().unwrap_or(url);
    name.split(['?', '#']).next().unwrap_or(name).to_string()
}

/// `sha256sum` output (`<hex>  name` or `<hex> *name`) → lower-case name → lower-case hex.
pub fn parse_checksums(text: &str) -> HashMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let (hash, name) = line.trim().split_once(char::is_whitespace)?;
            let name = name.trim().trim_start_matches('*');
            (hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())).then(|| (name.to_ascii_lowercase(), hash.to_ascii_lowercase()))
        })
        .collect()
}

/// Whether `latest` is a newer version than `installed` (semver; `v` prefixes ignored).
pub fn is_newer(latest: &str, installed: &str) -> bool {
    let parse = |v: &str| semver::Version::parse(v.trim().trim_start_matches('v'));
    match (parse(latest), parse(installed)) {
        (Ok(l), Ok(i)) => l > i,
        _ => latest.trim_start_matches('v') != installed.trim_start_matches('v'),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{
      "version": "1.0.2", "notes": "Faster matcher", "pub_date": "2026-10-01T10:00:00Z",
      "platforms": { "windows-x86_64": { "signature": "c2ln", "url": "https://github.com/HoangTrongPhi/P/releases/download/v1.0.2/Poseidon_1.0.2_x64-setup.exe" } }
    }"#;

    #[test]
    fn reads_tauri_manifest() {
        let r = parse_manifest(MANIFEST).unwrap();
        assert_eq!(r.version, "1.0.2");
        assert_eq!(r.notes.as_deref(), Some("Faster matcher"));
        assert_eq!(file_name(&r.url), "Poseidon_1.0.2_x64-setup.exe");
        assert_eq!(sibling_url(&r.url, CHECKSUMS_FILE), "https://github.com/HoangTrongPhi/P/releases/download/v1.0.2/SHA256SUMS.txt");
        assert!(parse_manifest(r#"{"version":"1","platforms":{}}"#).is_err());
    }

    #[test]
    fn checksums() {
        let sums = parse_checksums(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  Poseidon_1.0.2_x64-setup.exe\n\
             E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 *latest.json\n\
             nonsense line\n",
        );
        assert_eq!(sums.len(), 2);
        assert!(sums.contains_key("poseidon_1.0.2_x64-setup.exe"));
        assert_eq!(sums["latest.json"], "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    #[test]
    fn version_order() {
        assert!(is_newer("1.0.2", "1.0.1"));
        assert!(is_newer("v1.1.0", "1.0.9"));
        assert!(is_newer("1.1.0", "1.1.0-beta.1"));
        assert!(!is_newer("1.0.1", "1.0.1"));
        assert!(!is_newer("1.0.0", "1.0.1"));
    }

    /// Live check against Poseidon's real release: `cargo test -- --ignored poseidon_release`.
    #[tokio::test]
    #[ignore]
    async fn poseidon_release() {
        let app = crate::catalog::bundled().app("poseidon").unwrap().clone();
        let latest = fetch_latest(&app).await.unwrap();
        println!("Poseidon latest: {} ({})", latest.version, latest.url);
        assert!(semver::Version::parse(&latest.version).is_ok());
        assert!(!latest.signature.is_empty());
    }
}
