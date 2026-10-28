//! __APP_NAME__ — Tauri 2 backend.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AbyssContext {
    managed: bool,
    launcher_version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    abyss: AbyssContext,
}

/// Version, and whether the Abyss launcher started us (it sets `ABYSS=1`).
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        abyss: AbyssContext { managed: std::env::var("ABYSS").is_ok_and(|v| v == "1"), launcher_version: std::env::var("ABYSS_VERSION").ok() },
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running __APP_NAME__");
}
