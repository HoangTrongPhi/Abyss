//! Tray icon: open Abyss, start any installed app, check for updates, quit. Closing the window
//! only hides it (Settings → Keep running in the tray), like Creative Cloud.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

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

#[derive(Default)]
pub struct TrayApps(Mutex<Vec<TrayApp>>);

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, apps: &[TrayApp]) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "show", "Open Abyss", true, None::<&str>)?)?;
    if !apps.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        for a in apps {
            menu.append(&MenuItem::with_id(app, format!("launch:{}", a.id), &a.name, true, None::<&str>)?)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "check", "Check for updates", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit Abyss", true, None::<&str>)?)?;
    Ok(menu)
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Abyss")
        .menu(&build_menu(app, &[])?)
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
                let entry = app.state::<TrayApps>().0.lock().ok().and_then(|apps| apps.iter().find(|a| a.id == app_id).cloned());
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

/// The UI keeps the tray's app list in step with what is installed.
pub fn set_apps<R: Runtime>(app: &AppHandle<R>, apps: Vec<TrayApp>) -> tauri::Result<()> {
    let menu = build_menu(app, &apps)?;
    if let Ok(mut current) = app.state::<TrayApps>().0.lock() {
        *current = apps;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}
