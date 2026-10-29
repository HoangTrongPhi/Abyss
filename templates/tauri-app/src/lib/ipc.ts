// Every invoke() and event name of the app lives here (and in dev/mockBackend.ts, which answers them in ?mock).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppInfo, AppSettings, JobProgressEvent, LogEntry, StatsOptions, StatsReport, WatchRequest, WatchStatus } from "../types/__APP_ID__";

/** False in a plain browser (`npm run dev` without `?mock`): backend calls are skipped. */
export const inTauri = isTauri();

export const EVENTS = {
  log: "log://entry",
  stats: "stats://progress",
  watch: "watch://status",
} as const;

export const ipc = {
  appInfo: () => invoke<AppInfo>("app_info"),
  logHistory: () => invoke<LogEntry[]>("log_history"),
  uiLog: (level: string, message: string) => invoke<void>("ui_log", { level, message }),
  cancelJob: (jobId: number) => invoke<boolean>("cancel_job", { jobId }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  getSettings: () => invoke<AppSettings>("get_settings"),
  setSettings: (settings: AppSettings) => invoke<void>("set_settings", { settings }),

  folderStats: (path: string, options: StatsOptions) => invoke<StatsReport>("folder_stats", { path, options }),

  watchStart: (request: WatchRequest) => invoke<number>("watch_start", { request }),
  watchStop: (watchId: number) => invoke<boolean>("watch_stop", { watchId }),
  watchList: () => invoke<WatchStatus[]>("watch_list"),
};

export const on = {
  log: (cb: (e: LogEntry) => void): Promise<UnlistenFn> => listen<LogEntry>(EVENTS.log, (e) => cb(e.payload)),
  statsProgress: (cb: (e: JobProgressEvent) => void): Promise<UnlistenFn> => listen<JobProgressEvent>(EVENTS.stats, (e) => cb(e.payload)),
  watch: (cb: (e: WatchStatus) => void): Promise<UnlistenFn> => listen<WatchStatus>(EVENTS.watch, (e) => cb(e.payload)),
};
