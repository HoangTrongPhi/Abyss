//! Tauri IPC handlers. Each submodule wraps one `core` engine; handlers stay thin and run
//! blocking work on the async runtime's blocking pool.

pub mod app_cmd;
pub mod sample_cmd;
pub mod watch_cmd;

/// The JSON the frontend sends (see `src/types/__APP_ID__.ts`) must decode into the command inputs.
#[cfg(test)]
mod contract_tests {
    use super::watch_cmd::{WatchAction, WatchRequest};
    use crate::core::sample::StatsOptions;
    use crate::utils::watch::WatchConfig;
    use serde_json::json;

    #[test]
    fn stats_options_from_ts() {
        let o: StatsOptions = serde_json::from_value(json!({ "recursive": false, "exclude": ["*.tmp"] })).unwrap();
        assert_eq!(o, StatsOptions { recursive: false, exclude: vec!["*.tmp".into()] });
        let empty: StatsOptions = serde_json::from_value(json!({})).unwrap();
        assert!(empty.recursive && empty.exclude.is_empty());
    }

    #[test]
    fn watch_config_from_ts() {
        let c: WatchConfig = serde_json::from_value(json!({ "paths": ["D:/art"], "recursive": true, "include": ["*.png"], "exclude": [], "debounceMs": 250, "settleMs": 100 })).unwrap();
        assert_eq!((c.debounce_ms, c.settle_ms, c.include.len()), (250, 100, 1));
        let d: WatchConfig = serde_json::from_value(json!({ "paths": ["D:/art"] })).unwrap();
        assert_eq!((d.debounce_ms, d.settle_ms, d.recursive), (500, 300, true));
    }

    #[test]
    fn watch_request_from_ts() {
        let r: WatchRequest = serde_json::from_value(json!({ "action": { "kind": "folderStats", "path": "D:/art", "options": { "recursive": true, "exclude": [] } } })).unwrap();
        assert!(r.config.is_none());
        let WatchAction::FolderStats { path, .. } = &r.action;
        assert_eq!(path, "D:/art");
        assert_eq!(r.action.default_config().paths, [std::path::PathBuf::from("D:/art")]);
        let no_opts: WatchRequest = serde_json::from_value(json!({ "action": { "kind": "folderStats", "path": "x" }, "config": null })).unwrap();
        assert!(matches!(no_opts.action, WatchAction::FolderStats { ref options, .. } if options.recursive));
    }
}
