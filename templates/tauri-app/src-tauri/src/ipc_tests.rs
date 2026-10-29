//! End-to-end IPC tests: the real command set (`configure`) on Tauri's mock runtime, invoked
//! with the same JSON the frontend stores send (`src/stores/*Store.ts` via `src/lib/ipc.ts`).

use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::commands::sample_cmd::PROGRESS_EVENT;
use crate::utils::jobs::JobRegistry;
use crate::utils::watch::WATCH_EVENT;

pub(crate) struct Harness {
    pub app: App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
}

#[allow(dead_code)]
impl Harness {
    pub fn new() -> Self {
        let app = super::configure(mock_builder()).build(mock_context(noop_assets())).expect("build mock app");
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("main window");
        Harness { app, webview }
    }

    /// `invoke(cmd, args)` exactly as `@tauri-apps/api/core` would send it.
    pub fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        self.invoke_body(cmd, args).map(|body| body.deserialize::<Value>().expect("JSON response"))
    }

    /// For commands that answer with an ArrayBuffer (`tauri::ipc::Response`).
    pub fn invoke_raw(&self, cmd: &str, args: Value) -> Result<Vec<u8>, Value> {
        match self.invoke_body(cmd, args)? {
            InvokeResponseBody::Raw(bytes) => Ok(bytes),
            InvokeResponseBody::Json(j) => panic!("{cmd}: expected raw bytes, got JSON {j}"),
        }
    }

    fn invoke_body(&self, cmd: &str, args: Value) -> Result<InvokeResponseBody, Value> {
        let url = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: url.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
    }

    pub fn ok(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args).unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
    }

    /// Collect payloads of a backend event.
    pub fn listen(&self, event: &str) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::channel();
        self.app.listen_any(event, move |e| {
            let _ = tx.send(serde_json::from_str(e.payload()).unwrap_or(Value::Null));
        });
        rx
    }
}

pub(crate) fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn sample_tree() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (n, len) in [("a.png", 300), ("b.png", 100), ("c.json", 20)] {
        fs::write(dir.path().join(n), vec![0u8; len]).unwrap();
    }
    dir
}

#[test]
fn app_info_log_and_settings() {
    let h = Harness::new();
    let info = h.ok("app_info", json!({}));
    assert!(info["version"].as_str().is_some_and(|v| !v.is_empty()));
    assert_eq!(info["debug"], cfg!(debug_assertions));
    assert!(info["abyss"]["managed"].is_boolean());
    // A command logs, then the UI backfills it.
    let dir = sample_tree();
    h.ok("folder_stats", json!({ "path": s(dir.path()), "options": { "recursive": true, "exclude": [] } }));
    let logs = h.ok("log_history", json!({}));
    assert!(logs.as_array().unwrap().iter().any(|l| l["source"] == "stats" && l["level"] == "info"));
    assert_eq!(h.ok("ui_log", json!({ "level": "warn", "message": "from the UI" })), Value::Null);
    assert!(h.invoke("open_url", json!({ "url": "file:///C:/x" })).is_err());
    assert!(h.invoke("set_settings", json!({ "settings": [1] })).is_err(), "object only");
    assert!(h.ok("get_settings", json!({})).is_object());
}

#[test]
fn folder_stats_reports_progress() {
    let h = Harness::new();
    let progress = h.listen(PROGRESS_EVENT);
    let dir = sample_tree();
    let r = h.ok("folder_stats", json!({ "path": s(dir.path()), "options": { "recursive": true, "exclude": ["*.json"] } }));
    assert_eq!((r["files"].as_u64(), r["bytes"].as_u64()), (Some(2), Some(400)));
    assert_eq!((r["ok"].as_bool(), r["cancelled"].as_bool()), (Some(true), Some(false)));
    assert!(r["elapsedMs"].is_u64() && r["issues"].as_array().unwrap().is_empty());
    let events: Vec<Value> = progress.try_iter().collect();
    assert!(events.len() >= 2, "{events:?}");
    assert!(events[0]["jobId"].as_u64().unwrap() > 0);
    let last = events.last().unwrap();
    assert_eq!((last["done"].as_u64(), last["total"].as_u64()), (Some(2), Some(2)));

    let err = h.invoke("folder_stats", json!({ "path": s(&dir.path().join("missing")) })).unwrap_err();
    assert!(err.as_str().unwrap().starts_with("Folder not found"));
}

#[test]
fn one_job_per_kind_and_cancel() {
    let h = Harness::new();
    let jobs = h.app.state::<JobRegistry>();
    let running = jobs.start("stats").unwrap();
    let dir = sample_tree();
    let err = h.invoke("folder_stats", json!({ "path": s(dir.path()) })).unwrap_err();
    assert_eq!(err, "Stats is already running");
    assert_eq!(h.ok("cancel_job", json!({ "jobId": running.id })), true);
    assert!(running.cancel.load(std::sync::atomic::Ordering::Relaxed));
    drop(running);
    assert_eq!(h.ok("cancel_job", json!({ "jobId": 999 })), false);
    assert!(h.invoke("folder_stats", json!({ "path": s(dir.path()) })).is_ok());
}

#[test]
fn watch_reruns_on_change() {
    let h = Harness::new();
    let status = h.listen(WATCH_EVENT);
    let dir = sample_tree();
    let request = json!({ "request": {
        "action": { "kind": "folderStats", "path": s(dir.path()), "options": { "recursive": true, "exclude": [] } },
        "config": { "paths": [s(dir.path())], "debounceMs": 100, "settleMs": 50 }
    } });
    let id = h.ok("watch_start", request).as_u64().unwrap();

    let idle_after_run = |rx: &mpsc::Receiver<Value>| loop {
        let s = rx.recv_timeout(Duration::from_secs(5)).expect("watch://status within 5 s");
        if s["state"] == "idle" && s["lastRunAt"].is_u64() {
            return s;
        }
    };
    let first = idle_after_run(&status);
    assert_eq!(first["watchId"], id);
    assert!(first["lastSummary"].as_str().unwrap().starts_with("3 file(s)"));

    fs::write(dir.path().join("d.png"), vec![0u8; 10]).unwrap();
    let second = idle_after_run(&status);
    assert!(second["lastSummary"].as_str().unwrap().starts_with("4 file(s)"), "{second}");
    assert!(second["changedPaths"].as_array().unwrap().iter().any(|p| p.as_str().unwrap().ends_with("d.png")));

    assert_eq!(h.ok("watch_list", json!({})).as_array().unwrap().len(), 1);
    assert_eq!(h.ok("watch_stop", json!({ "watchId": id })), true);
    assert_eq!(h.ok("watch_stop", json!({ "watchId": id })), false);
    assert!(h.ok("watch_list", json!({})).as_array().unwrap().is_empty());
}
