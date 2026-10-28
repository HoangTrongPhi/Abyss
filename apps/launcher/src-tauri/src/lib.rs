//! Abyss — Tauri 2 backend: installs, updates and launches the suite's apps and Blender add-ons.

mod blender;
mod catalog;
mod commands;
mod http;
mod i18n;
mod installer;
mod release;
mod settings;
mod system;
mod tray;
mod verify;

use std::sync::Mutex;

use tauri::{Manager, WindowEvent};

use commands::{AppPaths, CatalogState};
use settings::SettingsStore;

pub fn run() {
    tauri::Builder::default()
        // First: a second start only brings the running Abyss to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            let settings = SettingsStore::load(data.join("settings.json"));
            let loaded = commands::initial_catalog(&data, &settings.get());
            app.manage(AppPaths { downloads: data.join("downloads"), data });
            app.manage(settings);
            app.manage(CatalogState(Mutex::new(loaded)));
            app.manage(installer::Jobs::default());
            app.manage(tray::TrayApps::default());
            app.manage(blender::BlenderCache::default());
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && window.state::<SettingsStore>().get().close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::catalog_get,
            commands::catalog_refresh,
            commands::app_states,
            commands::check_updates,
            commands::install_app,
            commands::uninstall_app,
            commands::launch_app,
            commands::reveal_path,
            commands::open_url,
            commands::set_tray_apps,
            commands::notify_update,
            commands::get_settings,
            commands::save_settings,
            commands::set_language,
            commands::add_local_app,
            commands::remove_local_app,
            commands::blender_scan,
            commands::addon_install,
            commands::addon_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Abyss");
}
