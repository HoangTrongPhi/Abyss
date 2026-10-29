use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use crate::core::sample::{folder_stats as run_stats, summary, StatsOptions, StatsReport};
use crate::core::RunCtx;
use crate::utils::jobs::{progress_emitter, JobRegistry};
use crate::utils::logbus::{self, Level};

/// Event name; keep in sync with `EVENTS.stats` in `src/lib/ipc.ts`.
pub const PROGRESS_EVENT: &str = "stats://progress";

/// Folder Stats as a job (kind `stats`): progress on `stats://progress`, cancel with `cancel_job`.
#[tauri::command]
pub async fn folder_stats<R: Runtime>(app: AppHandle<R>, jobs: State<'_, JobRegistry>, path: String, options: Option<StatsOptions>) -> Result<StatsReport, String> {
    let job = jobs.start("stats")?;
    let options = options.unwrap_or_default();
    let root = PathBuf::from(&path);
    let handle = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        let progress = progress_emitter(&handle, PROGRESS_EVENT, job.id);
        let r = run_stats(&root, &options, &RunCtx { progress: &progress, cancel: &job.cancel });
        drop(job);
        r
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| {
        logbus::emit(&app, Level::Error, "stats", e.to_string());
        e.to_string()
    })?;
    let level = if report.cancelled { Level::Warn } else { Level::Info };
    let state = if report.cancelled { " (cancelled)" } else { "" };
    logbus::emit(&app, level, "stats", format!("{path}: {} in {} ms{state}", summary(&report), report.elapsed_ms));
    Ok(report)
}
