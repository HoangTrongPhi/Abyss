//! IPC commands (thin: the work is in the modules they call). Types mirror `src/lib/types.ts`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::blender::{self, BlenderCache, BlenderInstall};
use crate::catalog::{self, CatalogAddon, CatalogApp, LoadedCatalog, Source};
use crate::i18n::Lang;
use crate::installer::{self, InstallPlan, InstallTarget, Jobs, Phase, Reporter};
use crate::release::{self, LatestRelease};
use crate::settings::{self, LocalApp, Settings, SettingsStore};
use crate::system::{self, Installed};
use crate::tray::{self, TrayApp};
use crate::http;

pub struct AppPaths {
    pub data: PathBuf,
    pub downloads: PathBuf,
}

pub struct CatalogState(pub Mutex<LoadedCatalog>);

fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    m.lock().map_err(|_| "Internal state is locked".to_string())
}

// --------------------------------------------------------------------------- catalog

/// `ABYSS_CATALOG` (env) or Settings → Catalog source: a URL or a local catalog.json.
fn custom_source(settings: &Settings) -> Option<String> {
    std::env::var("ABYSS_CATALOG").ok().or_else(|| settings.catalog_url.clone()).filter(|s| !s.trim().is_empty())
}

fn best_known(data: &Path) -> LoadedCatalog {
    let bundled = catalog::bundled();
    let base_url = catalog::base_of(catalog::DEFAULT_URL);
    match catalog::read_cache(&data.join("catalog.json")) {
        Some(c) if c.revision > bundled.revision => LoadedCatalog { catalog: c, source: Source::Cache, base_url, error: None },
        _ => LoadedCatalog { catalog: bundled, source: Source::Bundled, base_url, error: None },
    }
}

/// What the launcher shows before (or without) the network: a local custom catalog, else the
/// newer of the bundled and the cached copy.
pub fn initial_catalog(data: &Path, settings: &Settings) -> LoadedCatalog {
    let Some(src) = custom_source(settings).filter(|s| !s.starts_with("http")) else { return best_known(data) };
    match std::fs::read_to_string(http::local_path(&src)).map_err(|e| e.to_string()).and_then(|t| catalog::parse(&t)) {
        Ok(c) => LoadedCatalog { catalog: c, source: Source::Custom, base_url: None, error: None },
        Err(e) => LoadedCatalog { error: Some(format!("{src}: {e}")), ..best_known(data) },
    }
}

#[tauri::command]
pub fn catalog_get(state: State<'_, CatalogState>) -> Result<LoadedCatalog, String> {
    Ok(lock(&state.0)?.clone())
}

/// Download the catalog; keep the best copy and say why a download failed.
#[tauri::command]
pub async fn catalog_refresh(paths: State<'_, AppPaths>, settings: State<'_, SettingsStore>, state: State<'_, CatalogState>) -> Result<LoadedCatalog, String> {
    let custom = custom_source(&settings.get());
    let url = custom.clone().unwrap_or_else(|| catalog::DEFAULT_URL.to_string());
    let fetched = http::get_text(&url).await.and_then(|t| catalog::parse(&t));
    let mut current = lock(&state.0)?;
    match fetched {
        Ok(c) if custom.is_some() => *current = LoadedCatalog { catalog: c, source: Source::Custom, base_url: catalog::base_of(&url), error: None },
        Ok(c) if c.revision >= current.catalog.revision => {
            let _ = settings::write_json(&paths.data.join("catalog.json"), &c);
            *current = LoadedCatalog { catalog: c, source: Source::Remote, base_url: catalog::base_of(&url), error: None };
        }
        Ok(_) => current.error = None,
        Err(e) => current.error = Some(e),
    }
    Ok(current.clone())
}

fn catalog_app(state: &CatalogState, id: &str) -> Result<CatalogApp, String> {
    lock(&state.0)?.catalog.app(id).cloned().ok_or_else(|| format!("'{id}' is not in the catalog"))
}

fn catalog_addon(state: &CatalogState, id: &str) -> Result<CatalogAddon, String> {
    lock(&state.0)?.catalog.addon(id).cloned().ok_or_else(|| format!("Add-on '{id}' is not in the catalog"))
}

// --------------------------------------------------------------------------- apps

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    data_dir: PathBuf,
    /// Where apps go when no install folder is chosen (`%LOCALAPPDATA%`).
    default_install_root: PathBuf,
}

#[tauri::command]
pub fn app_info(paths: State<'_, AppPaths>) -> AppInfo {
    AppInfo { version: env!("CARGO_PKG_VERSION").into(), data_dir: paths.data.clone(), default_install_root: system::default_install_root() }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    id: String,
    installed: Option<Installed>,
    running: bool,
}

/// Installed version and running state of every catalog app and local app.
#[tauri::command]
pub async fn app_states(state: State<'_, CatalogState>, settings: State<'_, SettingsStore>) -> Result<Vec<AppStatus>, String> {
    let apps = lock(&state.0)?.catalog.apps.clone();
    let locals = settings.get().local_apps;
    tokio::task::spawn_blocking(move || {
        let running = system::running_exes();
        let is_running = |exe: Option<&PathBuf>| exe.is_some_and(|e| running.contains(&system::path_key(e)));
        let mut out = Vec::new();
        for app in apps {
            let Some(spec) = &app.install else { continue };
            let installed = system::installed(spec);
            let running = is_running(installed.as_ref().and_then(|i| i.exe.as_ref()));
            out.push(AppStatus { id: app.id, installed, running });
        }
        for l in locals {
            let installed = l.path.exists().then(|| Installed {
                version: String::new(),
                install_dir: l.path.parent().map(Path::to_path_buf).unwrap_or_default(),
                exe: Some(l.path.clone()),
                uninstaller: None,
            });
            out.push(AppStatus { running: is_running(Some(&l.path)), id: l.id, installed });
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestInfo {
    id: String,
    latest: Option<LatestRelease>,
    /// Installed and older than `latest`.
    update_available: bool,
    error: Option<String>,
}

/// The newest release of every installable app, fetched in parallel, compared with what is installed.
#[tauri::command]
pub async fn check_updates(state: State<'_, CatalogState>) -> Result<Vec<LatestInfo>, String> {
    let apps: Vec<CatalogApp> = lock(&state.0)?.catalog.apps.iter().filter(|a| a.status.installable() && a.install.is_some()).cloned().collect();
    let tasks: Vec<_> = apps
        .into_iter()
        .map(|a| {
            tauri::async_runtime::spawn(async move {
                let r = release::fetch_latest(&a).await;
                let installed = a.install.as_ref().and_then(system::installed);
                let update_available = matches!((&r, &installed), (Ok(l), Some(i)) if release::is_newer(&l.version, &i.version));
                LatestInfo { id: a.id, latest: r.as_ref().ok().cloned(), update_available, error: r.err() }
            })
        })
        .collect();
    let mut out = Vec::new();
    for t in tasks {
        out.push(t.await.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Choices from the install dialog; what is left out comes from the settings.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InstallOptions {
    root: Option<PathBuf>,
    desktop_shortcut: Option<bool>,
}

fn install_root(settings: &Settings, chosen: Option<PathBuf>) -> PathBuf {
    chosen.or_else(|| settings.install_root.clone()).unwrap_or_else(system::default_install_root)
}

/// Where a new install of `id` would go under `root` (or the default folder), for the install dialog.
/// Off the main thread: it probes the folder and the drives (a sleeping network drive can take a while).
#[tauri::command]
pub async fn install_target(id: String, root: Option<PathBuf>, settings: State<'_, SettingsStore>, state: State<'_, CatalogState>) -> Result<InstallTarget, String> {
    let entry = catalog_app(&state, &id)?;
    let spec = entry.install.clone().ok_or_else(|| format!("{} cannot be installed", entry.name))?;
    let root = install_root(&settings.get(), root);
    tokio::task::spawn_blocking(move || installer::inspect_target(&root, &spec)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_app(
    app: AppHandle,
    id: String,
    options: Option<InstallOptions>,
    paths: State<'_, AppPaths>,
    settings: State<'_, SettingsStore>,
    state: State<'_, CatalogState>,
    jobs: State<'_, Jobs>,
) -> Result<Installed, String> {
    let entry = catalog_app(&state, &id)?;
    let _job = jobs.begin(&id)?;
    let (s, o) = (settings.get(), options.unwrap_or_default());
    let plan = InstallPlan { desktop_shortcut: o.desktop_shortcut.unwrap_or(s.desktop_shortcut), root: install_root(&s, o.root) };
    let r = Reporter::new(&app, &id);
    let result = installer::install_app(&r, &entry, &paths.downloads, &plan).await;
    r.finish(result, |i| settings.lang().installed(&entry.name, &i.version))
}

#[tauri::command]
pub async fn uninstall_app(app: AppHandle, id: String, settings: State<'_, SettingsStore>, state: State<'_, CatalogState>, jobs: State<'_, Jobs>) -> Result<(), String> {
    let entry = catalog_app(&state, &id)?;
    let _job = jobs.begin(&id)?;
    let r = Reporter::new(&app, &id);
    let result = installer::uninstall_app(&r, &entry).await;
    r.finish(result, |_| settings.lang().uninstalled(&entry.name))
}

#[tauri::command]
pub fn launch_app(id: String, state: State<'_, CatalogState>, settings: State<'_, SettingsStore>) -> Result<(), String> {
    if let Some(local) = settings.get().local_apps.into_iter().find(|l| l.id == id) {
        return system::launch(&local.path, &local.args);
    }
    let entry = catalog_app(&state, &id)?;
    let spec = entry.install.as_ref().ok_or_else(|| format!("{} cannot be launched", entry.name))?;
    let exe = system::installed(spec).and_then(|i| i.exe).ok_or_else(|| format!("{} is not installed", entry.name))?;
    system::launch(&exe, &[])
}

#[tauri::command]
pub fn reveal_path(path: PathBuf) -> Result<(), String> {
    system::reveal(&path)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    system::open_url(&url)
}

#[tauri::command]
pub fn set_tray_apps(app: AppHandle, apps: Vec<TrayApp>, updates: usize) -> Result<(), String> {
    tray::set_apps(&app, apps, updates).map_err(|e| e.to_string())
}

/// Windows notification for newly found updates (Settings → Notifications). Skipped while the
/// window is in front: the bell in the top bar already shows them there. True when one was shown.
#[tauri::command]
pub fn notify_update(app: AppHandle, title: String, body: String, settings: State<'_, SettingsStore>) -> Result<bool, String> {
    if !settings.get().notify {
        return Ok(false);
    }
    let in_front = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false));
    if in_front {
        return Ok(false);
    }
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())?;
    Ok(true)
}

// --------------------------------------------------------------------------- settings & local apps

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsStore>) -> Settings {
    settings.get()
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn save_settings(
    close_to_tray: bool,
    auto_check: bool,
    notify: bool,
    catalog_url: Option<String>,
    install_root: Option<PathBuf>,
    ask_install_dir: bool,
    desktop_shortcut: bool,
    paths: State<'_, AppPaths>,
    settings: State<'_, SettingsStore>,
    state: State<'_, CatalogState>,
) -> Result<Settings, String> {
    let catalog_url = catalog_url.map(|u| u.trim().to_string()).filter(|u| !u.is_empty());
    // The default folder is stored as "no choice", so it follows %LOCALAPPDATA%.
    let default_root = system::path_key(&system::default_install_root());
    let install_root = install_root.filter(|r| !r.as_os_str().is_empty() && system::path_key(r) != default_root);
    if let Some(root) = &install_root {
        if !root.is_absolute() || !system::writable(root) {
            return Err(settings.lang().cannot_write(&root.display().to_string()));
        }
    }
    let changed = settings.update(|s| {
        let changed = s.catalog_url != catalog_url;
        s.close_to_tray = close_to_tray;
        s.auto_check = auto_check;
        s.notify = notify;
        s.catalog_url = catalog_url;
        s.install_root = install_root;
        s.ask_install_dir = ask_install_dir;
        s.desktop_shortcut = desktop_shortcut;
        changed
    })?;
    if changed {
        *lock(&state.0)? = initial_catalog(&paths.data, &settings.get());
    }
    Ok(settings.get())
}

/// The UI's language, for the texts the backend shows itself (tray, job results).
#[tauri::command]
pub fn set_language(app: AppHandle, language: String, settings: State<'_, SettingsStore>) -> Result<(), String> {
    let code = Lang::parse(&language).code();
    if settings.get().language == code {
        return Ok(());
    }
    settings.update(|s| s.language = code.to_string())?;
    tray::refresh(&app).map_err(|e| e.to_string())
}

/// Put a program the user picked (or dropped) into a free slot.
#[tauri::command]
pub fn add_local_app(path: PathBuf, name: Option<String>, settings: State<'_, SettingsStore>) -> Result<LocalApp, String> {
    if !path.exists() {
        return Err(format!("{} does not exist", path.display()));
    }
    let name = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());
    settings.update(|s| {
        let taken: Vec<String> = s.local_apps.iter().map(|l| l.id.clone()).collect();
        let app = LocalApp { id: settings::local_id(&name, &taken), name, path, args: Vec::new() };
        s.local_apps.push(app.clone());
        app
    })
}

#[tauri::command]
pub fn remove_local_app(id: String, settings: State<'_, SettingsStore>) -> Result<(), String> {
    settings.update(|s| s.local_apps.retain(|l| l.id != id))
}

// --------------------------------------------------------------------------- Blender add-ons

/// Blender installs (cached after the first scan; `force` looks again) with their add-ons re-read.
#[tauri::command]
pub async fn blender_scan(force: bool, cache: State<'_, BlenderCache>) -> Result<Vec<BlenderInstall>, String> {
    let cached = lock(&cache.0)?.clone().filter(|_| !force);
    let installs = tokio::task::spawn_blocking(move || match cached {
        Some(mut c) => {
            blender::refresh_modules(&mut c);
            c
        }
        None => blender::discover(),
    })
    .await
    .map_err(|e| e.to_string())?;
    *lock(&cache.0)? = Some(installs.clone());
    Ok(installs)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonOutcome {
    executable: PathBuf,
    ok: bool,
    module: Option<String>,
    error: Option<String>,
}

async fn addon_zip_url(addon: &CatalogAddon) -> Result<String, String> {
    if let Some(url) = &addon.url {
        return Ok(url.clone());
    }
    let (Some(repo), Some(pattern)) = (&addon.repo, &addon.asset) else { return Err(format!("{} has no download", addon.name)) };
    let text = http::get_text(&format!("https://api.github.com/repos/{repo}/releases/latest")).await?;
    let release: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    release["assets"]
        .as_array()
        .and_then(|assets| assets.iter().find(|a| a["name"].as_str().is_some_and(|n| catalog::asset_matches(pattern, n))))
        .and_then(|a| a["browser_download_url"].as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("The latest release of {repo} has no asset matching {pattern}"))
}

/// Run the add-on tool in each chosen Blender, one after another. A Blender that is open is skipped:
/// it would write its own preferences back over the change when it closes.
fn run_in_each(executables: Vec<PathBuf>, action: &'static str, arg: String, scratch: PathBuf, lang: Lang) -> Vec<AddonOutcome> {
    let running = system::running_exes();
    executables
        .into_iter()
        .map(|exe| {
            if running.contains(&system::path_key(&exe)) {
                return AddonOutcome { error: Some(lang.texts().blender_open.into()), executable: exe, ok: false, module: None };
            }
            match blender::run_tool(&exe, action, &arg, &scratch) {
                Ok(t) => AddonOutcome { executable: exe, ok: t.ok, module: t.module, error: t.error },
                Err(e) => AddonOutcome { executable: exe, ok: false, module: None, error: Some(e) },
            }
        })
        .collect()
}

fn ok_count(outcomes: &[AddonOutcome]) -> usize {
    outcomes.iter().filter(|o| o.ok).count()
}

/// Install a catalog add-on (`catalog_id`) or a zip from disk (`zip_path`) into the given Blenders.
/// `key` is the UI's job id for progress events.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri injects the State arguments
pub async fn addon_install(
    app: AppHandle,
    key: String,
    catalog_id: Option<String>,
    zip_path: Option<PathBuf>,
    executables: Vec<PathBuf>,
    paths: State<'_, AppPaths>,
    settings: State<'_, SettingsStore>,
    state: State<'_, CatalogState>,
    jobs: State<'_, Jobs>,
) -> Result<Vec<AddonOutcome>, String> {
    let lang = settings.lang();
    let _job = jobs.begin(&key)?;
    let r = Reporter::new(&app, &key);
    let result = async {
        let zip = match (zip_path, catalog_id) {
            (Some(p), _) => p,
            (None, Some(id)) => {
                let addon = catalog_addon(&state, &id)?;
                r.phase(Phase::Resolving, None);
                let url = addon_zip_url(&addon).await?;
                let dest = paths.downloads.join("addons").join(release::file_name(&url));
                http::download(&url, &dest, |d, t| r.progress(d, t)).await?;
                r.phase(Phase::Verifying, None);
                installer::verify_download(&dest, &url, None, None, true).await?;
                dest
            }
            (None, None) => return Err("Nothing to install".to_string()),
        };
        r.phase(Phase::Installing, None);
        let scratch = paths.data.join("blender");
        let arg = zip.to_string_lossy().to_string();
        tokio::task::spawn_blocking(move || run_in_each(executables, "install", arg, scratch, lang)).await.map_err(|e| e.to_string())
    }
    .await;
    r.finish(result, |o| lang.addons_installed(ok_count(o), o.len()))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri injects the State arguments
pub async fn addon_remove(
    app: AppHandle,
    key: String,
    module: String,
    executables: Vec<PathBuf>,
    paths: State<'_, AppPaths>,
    settings: State<'_, SettingsStore>,
    jobs: State<'_, Jobs>,
) -> Result<Vec<AddonOutcome>, String> {
    let lang = settings.lang();
    let _job = jobs.begin(&key)?;
    let r = Reporter::new(&app, &key);
    r.phase(Phase::Uninstalling, None);
    let scratch = paths.data.join("blender");
    let result = tokio::task::spawn_blocking(move || run_in_each(executables, "remove", module, scratch, lang)).await.map_err(|e| e.to_string());
    r.finish(result, |o| lang.addons_removed(ok_count(o), o.len()))
}
