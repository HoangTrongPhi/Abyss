//! Launcher settings and the user's own (local) apps, in `settings.json` in the app data folder.
//! Appearance lives in the webview (localStorage), like in every other app of the suite.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Closing the window keeps Abyss in the tray (updates still install when apps close).
    pub close_to_tray: bool,
    /// Check every app for updates at start and every few hours.
    pub auto_check: bool,
    /// Catalog URL or file instead of the GitHub one (testing, private mirrors).
    pub catalog_url: Option<String>,
    /// Windows notification when a check finds a new version while the window is not in front.
    pub notify: bool,
    /// UI language (`en`, `vi`), mirrored here for the tray menu and job messages.
    pub language: String,
    /// Folder new apps install into (each in `<folder>\<product>`); `None`: `%LOCALAPPDATA%`, the installers' own default.
    pub install_root: Option<PathBuf>,
    /// Show the install dialog (folder, shortcut) before each new install.
    pub ask_install_dir: bool,
    /// Keep the desktop shortcut the installers make.
    pub desktop_shortcut: bool,
    pub local_apps: Vec<LocalApp>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            close_to_tray: true,
            auto_check: true,
            catalog_url: None,
            notify: true,
            language: "en".into(),
            install_root: None,
            ask_install_dir: true,
            desktop_shortcut: true,
            local_apps: Vec::new(),
        }
    }
}

/// A program the user put into a free slot: any .exe, script or shortcut.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApp {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    #[serde(default)]
    pub args: Vec<String>,
}

pub struct SettingsStore {
    path: PathBuf,
    inner: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        SettingsStore { path, inner: Mutex::new(inner) }
    }

    pub fn get(&self) -> Settings {
        self.inner.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn lang(&self) -> Lang {
        self.inner.lock().map(|s| Lang::parse(&s.language)).unwrap_or(Lang::En)
    }

    pub fn update<T>(&self, f: impl FnOnce(&mut Settings) -> T) -> Result<T, String> {
        let mut s = self.inner.lock().map_err(|_| "Settings are locked")?;
        let out = f(&mut s);
        write_json(&self.path, &*s)?;
        Ok(out)
    }
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    // Write then rename, so a crash never leaves half a file behind.
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

/// `My Tool.exe` → `local-my-tool`, unique among `taken`.
pub fn local_id(name: &str, taken: &[String]) -> String {
    let slug: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let slug = slug.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    let base = format!("local-{}", if slug.is_empty() { "app" } else { &slug });
    let mut id = base.clone();
    let mut n = 2;
    while taken.contains(&id) {
        id = format!("{base}-{n}");
        n += 1;
    }
    id
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_for_local_apps() {
        assert_eq!(local_id("My Tool", &[]), "local-my-tool");
        assert_eq!(local_id("Ảnh 2!", &[]), "local-nh-2");
        assert_eq!(local_id("!!!", &[]), "local-app");
        assert_eq!(local_id("x", &["local-x".into(), "local-x-2".into()]), "local-x-3");
    }

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let store = SettingsStore::load(dir.path().join("settings.json"));
        assert!(store.get().close_to_tray);
        assert_eq!(store.lang(), Lang::En);
        store.update(|s| s.local_apps.push(LocalApp { id: "local-a".into(), name: "A".into(), path: "C:/a.exe".into(), args: vec![] })).unwrap();
        let again = SettingsStore::load(dir.path().join("settings.json"));
        assert_eq!(again.get().local_apps.len(), 1);
    }

    #[test]
    fn older_settings_files_get_the_new_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{ "closeToTray": false, "autoCheck": true, "catalogUrl": null, "localApps": [] }"#).unwrap();
        let s = SettingsStore::load(path).get();
        assert!(!s.close_to_tray);
        assert!(s.notify);
        assert_eq!(s.language, "en");
        assert!(s.install_root.is_none() && s.ask_install_dir && s.desktop_shortcut);
    }
}
