//! Tray icon: open Abyss, start any installed app, check for updates, quit. Closing the window
//! only hides it (Settings → Keep running in the tray), like Creative Cloud. The tooltip counts
//! waiting updates; texts follow Settings → Language.

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::i18n::Lang;
use crate::settings::SettingsStore;
use crate::system;

const TRAY_ID: &str = "abyss";
/// Sent to the UI: `"check"` (Check for updates) or an error text to show.
pub const TRAY_EVENT: &str = "abyss://tray";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayApp {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    #[serde(default)]
    pub args: Vec<String>,
}

/// What the UI last put in the tray: launchable apps and the number of waiting updates.
#[derive(Default)]
pub struct TrayApps {
    apps: Mutex<Vec<TrayApp>>,
    updates: AtomicUsize,
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, apps: &[TrayApp], lang: Lang) -> tauri::Result<Menu<R>> {
    let t = lang.texts();
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "show", t.tray_open, true, None::<&str>)?)?;
    if !apps.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        for a in apps {
            menu.append(&MenuItem::with_id(app, format!("launch:{}", a.id), &a.name, true, None::<&str>)?)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "check", t.tray_check, true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", t.tray_quit, true, None::<&str>)?)?;
    Ok(menu)
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let lang = app.state::<SettingsStore>().lang();
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(lang.tray_tooltip(0))
        .menu(&build_menu(app, &[], lang)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "check" => {
                show_main(app);
                let _ = app.emit(TRAY_EVENT, "check");
            }
            "quit" => app.exit(0),
            id => {
                let Some(app_id) = id.strip_prefix("launch:") else { return };
                let entry = app.state::<TrayApps>().apps.lock().ok().and_then(|apps| apps.iter().find(|a| a.id == app_id).cloned());
                if let Some(a) = entry {
                    if let Err(e) = system::launch(&a.path, &a.args) {
                        show_main(app);
                        let _ = app.emit(TRAY_EVENT, e);
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// The UI keeps the tray's app list and update count in step with what is installed.
pub fn set_apps<R: Runtime>(app: &AppHandle<R>, apps: Vec<TrayApp>, updates: usize) -> tauri::Result<()> {
    let state = app.state::<TrayApps>();
    if let Ok(mut current) = state.apps.lock() {
        *current = apps;
    }
    state.updates.store(updates, Ordering::Relaxed);
    refresh(app)
}

/// Rebuild the menu and tooltip from the stored content, in the current language.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let lang = app.state::<SettingsStore>().lang();
    let state = app.state::<TrayApps>();
    let apps = state.apps.lock().map(|a| a.clone()).unwrap_or_default();
    let menu = build_menu(app, &apps, lang)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
        tray.set_tooltip(Some(lang.tray_tooltip(state.updates.load(Ordering::Relaxed))))?;
    }
    Ok(())
}
