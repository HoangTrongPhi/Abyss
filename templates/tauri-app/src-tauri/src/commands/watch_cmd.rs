use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::core::sample::{folder_stats, summary, StatsOptions};
use crate::core::{count_at_least, RunCtx, Severity};
use crate::utils::logbus::{self, Level};
use crate::utils::watch::{RunSummary, WatchConfig, WatchHandle, WatchStatus, Watcher, WATCH_EVENT};

/// What a watch re-runs. Each app adds its own actions here (`{ kind: "packProject", project }` …).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WatchAction {
    FolderStats {
        path: String,
        #[serde(default)]
        options: StatsOptions,
    },
}

impl WatchAction {
    /// What to watch when the request brings no config: the action's inputs, minus its outputs.
    pub fn default_config(&self) -> WatchConfig {
        match self {
            WatchAction::FolderStats { path, options } => WatchConfig { paths: vec![PathBuf::from(path)], recursive: options.recursive, exclude: options.exclude.clone(), ..Default::default() },
        }
    }

    pub fn label(&self) -> String {
        match self {
            WatchAction::FolderStats { path, .. } => format!("Folder Stats on {path}"),
        }
    }

    /// One run; shared by the Watch toggle and `--watch` on the command line.
    pub fn run(&self, _changed: &[PathBuf], cancel: &AtomicBool) -> RunSummary {
        match self {
            WatchAction::FolderStats { path, options } => match folder_stats(Path::new(path), options, &RunCtx { progress: &|_, _, _| {}, cancel }) {
                Ok(r) => RunSummary { summary: summary(&r), issues: count_at_least(&r.issues, Severity::Warn), error: None },
                Err(e) => RunSummary { summary: String::new(), issues: 0, error: Some(e.to_string()) },
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchRequest {
    pub action: WatchAction,
    #[serde(default)]
    pub config: Option<WatchConfig>,
}

/// Tauri state: running watches. They stop when the app closes and never restart on their own.
#[derive(Default)]
pub struct WatchRegistry {
    next: Mutex<u64>,
    watches: Mutex<HashMap<u64, WatchHandle>>,
}

/// Start watching; runs the action once at once, then after every relevant change. Returns the watch id.
#[tauri::command]
pub fn watch_start<R: Runtime>(app: AppHandle<R>, registry: State<'_, WatchRegistry>, request: WatchRequest) -> Result<u64, String> {
    let id = {
        let mut n = registry.next.lock().map_err(|e| e.to_string())?;
        *n += 1;
        *n
    };
    let config = request.config.unwrap_or_else(|| request.action.default_config());
    let action = request.action;
    let label = action.label();
    let (status_app, run_app) = (app.clone(), app.clone());
    let never = AtomicBool::new(false);
    let handle = Watcher::start(
        id,
        config,
        true,
        move |s: &WatchStatus| {
            let _ = status_app.emit(WATCH_EVENT, s);
        },
        move |changed| {
            let r = action.run(changed, &never);
            match &r.error {
                Some(e) => logbus::emit(&run_app, Level::Error, "watch", format!("{e}")),
                None => logbus::emit(&run_app, if r.issues > 0 { Level::Warn } else { Level::Info }, "watch", format!("Re-ran ({} change(s)): {}", changed.len(), r.summary)),
            }
            r
        },
    )?;
    registry.watches.lock().map_err(|e| e.to_string())?.insert(id, handle);
    logbus::emit(&app, Level::Info, "watch", format!("Watching: {label}"));
    Ok(id)
}

/// False when no watch had this id.
#[tauri::command]
pub fn watch_stop<R: Runtime>(app: AppHandle<R>, registry: State<'_, WatchRegistry>, watch_id: u64) -> Result<bool, String> {
    let removed = registry.watches.lock().map_err(|e| e.to_string())?.remove(&watch_id);
    if removed.is_some() {
        logbus::emit(&app, Level::Info, "watch", format!("Stopped watch {watch_id}"));
    }
    // Dropping the handle joins the worker; outside the lock.
    Ok(removed.is_some())
}

#[tauri::command]
pub fn watch_list(registry: State<'_, WatchRegistry>) -> Result<Vec<WatchStatus>, String> {
    let w = registry.watches.lock().map_err(|e| e.to_string())?;
    let mut v: Vec<WatchStatus> = w.values().map(WatchHandle::status).collect();
    v.sort_by_key(|s| s.watch_id);
    Ok(v)
}
