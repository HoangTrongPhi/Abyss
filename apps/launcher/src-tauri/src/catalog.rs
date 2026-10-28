//! The catalog: which apps and Blender add-ons Abyss offers (`catalog/catalog.json` at the repo root).
//!
//! Three copies can exist: the one compiled into the launcher, the last one downloaded (cached in
//! the app data folder) and a fresh download. The highest `revision` wins, so a launcher update never
//! goes back to an older list and an offline launcher still shows everything it knew.

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const SCHEMA: u32 = 1;
pub const DEFAULT_URL: &str = "https://raw.githubusercontent.com/HoangTrongPhi/Abyss/main/catalog/catalog.json";
const BUNDLED: &str = include_str!("../../../../catalog/catalog.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Available,
    Beta,
    ComingSoon,
    /// An empty, reserved place in the grid for a future app.
    Slot,
}

impl Status {
    pub fn installable(self) -> bool {
        matches!(self, Status::Available | Status::Beta)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub schema: u32,
    pub revision: u32,
    #[serde(default)]
    pub apps: Vec<CatalogApp>,
    #[serde(default)]
    pub addons: Vec<CatalogAddon>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogApp {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub icon: Option<String>,
    pub accent: Option<String>,
    pub status: Status,
    pub repo: Option<String>,
    pub homepage: Option<String>,
    pub install: Option<InstallSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallKind {
    /// Per-user NSIS installer (what `tauri build` makes): silent with `/S`, found in the Uninstall registry.
    Nsis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSpec {
    pub kind: InstallKind,
    /// `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<key>` (Tauri: the productName).
    pub uninstall_key: String,
    /// Executable file name inside the install folder.
    pub exe: String,
    /// Updater public key; when set, installers must carry a matching minisign signature.
    pub pubkey: Option<String>,
    /// Override for `https://github.com/<repo>/releases/latest/download/latest.json`.
    pub manifest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAddon {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub tagline: Option<String>,
    pub description: Option<String>,
    pub status: Status,
    /// Python module once installed (`my_addon`, or `bl_ext.user_default.<id>` for an extension).
    pub module: Option<String>,
    pub repo: Option<String>,
    /// Release asset name; `*` matches any run of characters.
    pub asset: Option<String>,
    pub url: Option<String>,
    pub min_blender: Option<String>,
    pub homepage: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Bundled,
    Cache,
    Remote,
    /// `ABYSS_CATALOG` or Settings → Catalog source.
    Custom,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedCatalog {
    pub catalog: Catalog,
    pub source: Source,
    /// Where relative icon paths resolve (the folder holding catalog.json), when it is on the web.
    pub base_url: Option<String>,
    /// Why the last refresh failed, if it did; the catalog shown is then the best copy at hand.
    pub error: Option<String>,
}

impl Catalog {
    pub fn app(&self, id: &str) -> Option<&CatalogApp> {
        self.apps.iter().find(|a| a.id == id)
    }

    pub fn addon(&self, id: &str) -> Option<&CatalogAddon> {
        self.addons.iter().find(|a| a.id == id)
    }
}

/// Parse and check a catalog: known schema, unique ids, installable entries complete.
pub fn parse(text: &str) -> Result<Catalog, String> {
    let catalog: Catalog = serde_json::from_str(text).map_err(|e| format!("Catalog is not valid: {e}"))?;
    if catalog.schema > SCHEMA {
        return Err(format!("Catalog schema {} is newer than this launcher understands ({SCHEMA}); update Abyss", catalog.schema));
    }
    let mut ids = HashSet::new();
    for app in &catalog.apps {
        if app.id.is_empty() || !ids.insert(format!("app:{}", app.id)) {
            return Err(format!("Duplicate or empty app id '{}'", app.id));
        }
        let has_source = app.repo.is_some() || app.install.as_ref().is_some_and(|i| i.manifest.is_some());
        if app.status.installable() && (app.name.is_empty() || app.install.is_none() || !has_source) {
            return Err(format!("App '{}' is installable but has no name, repo or install section", app.id));
        }
    }
    for addon in &catalog.addons {
        if addon.id.is_empty() || !ids.insert(format!("addon:{}", addon.id)) {
            return Err(format!("Duplicate or empty add-on id '{}'", addon.id));
        }
        let has_source = addon.url.is_some() || (addon.repo.is_some() && addon.asset.is_some());
        if addon.status.installable() && (addon.module.is_none() || !has_source) {
            return Err(format!("Add-on '{}' is installable but has no module, or neither url nor repo + asset", addon.id));
        }
    }
    Ok(catalog)
}

pub fn bundled() -> Catalog {
    parse(BUNDLED).expect("the bundled catalog is checked by the tests")
}

/// The folder part of a catalog URL, with a trailing slash, for resolving `icons/x.svg`.
pub fn base_of(url: &str) -> Option<String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return None;
    }
    url.rfind('/').map(|i| url[..=i].to_string())
}

/// Read the cached copy, if it is there and still valid.
pub fn read_cache(path: &Path) -> Option<Catalog> {
    std::fs::read_to_string(path).ok().and_then(|t| parse(&t).ok())
}

/// `*` wildcard match for release asset names (case-insensitive).
pub fn asset_matches(pattern: &str, name: &str) -> bool {
    let (p, n) = (pattern.to_ascii_lowercase(), name.to_ascii_lowercase());
    let parts: Vec<&str> = p.split('*').collect();
    if parts.len() == 1 {
        return p == n;
    }
    let (first, last) = (parts[0], parts[parts.len() - 1]);
    // ends_with on the remainder also keeps `first` and `last` from overlapping.
    if !n.starts_with(first) || !n[first.len()..].ends_with(last) {
        return false;
    }
    let mut rest = &n[first.len()..n.len() - last.len()];
    for mid in &parts[1..parts.len() - 1] {
        match rest.find(mid) {
            Some(i) => rest = &rest[i + mid.len()..],
            None => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_is_valid() {
        let c = bundled();
        assert_eq!(c.schema, SCHEMA);
        let poseidon = c.app("poseidon").expect("Poseidon is in the catalog");
        assert!(poseidon.status.installable());
        assert_eq!(poseidon.install.as_ref().unwrap().exe, "poseidon.exe");
        assert!(c.apps.iter().any(|a| a.status == Status::Slot), "the grid keeps free slots");
    }

    #[test]
    fn rejects_duplicates_and_incomplete_entries() {
        let dup = r#"{"schema":1,"revision":1,"apps":[{"id":"a","status":"slot"},{"id":"a","status":"slot"}]}"#;
        assert!(parse(dup).is_err());
        let incomplete = r#"{"schema":1,"revision":1,"apps":[{"id":"a","name":"A","status":"available"}]}"#;
        assert!(parse(incomplete).is_err());
        let future = r#"{"schema":99,"revision":1,"apps":[]}"#;
        assert!(parse(future).unwrap_err().contains("newer"));
    }

    #[test]
    fn wildcard_asset_names() {
        assert!(asset_matches("my_addon-*.zip", "My_Addon-1.2.0.zip"));
        assert!(asset_matches("*.zip", "x.zip"));
        assert!(asset_matches("a*b*c", "a-1-b-2-c"));
        assert!(!asset_matches("my_addon-*.zip", "my_addon-1.2.0.zip.sig"));
        assert!(!asset_matches("ab*ba", "aba"));
        assert!(asset_matches("exact.zip", "EXACT.zip"));
    }

    #[test]
    fn base_url() {
        assert_eq!(base_of(DEFAULT_URL).unwrap(), "https://raw.githubusercontent.com/HoangTrongPhi/Abyss/main/catalog/");
        assert_eq!(base_of(r"D:\catalog.json"), None);
    }
}
