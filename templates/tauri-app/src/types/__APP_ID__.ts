// Mirrors of the Rust structs (serde camelCase). Keep every field in sync with src-tauri/src.
import type { AbyssContext } from "@abyss/ui";

export type { LogEntry, LogLevel, WatchStatus } from "@abyss/ui";

export type TabId = "stats";

export interface AppInfo {
  version: string;
  debug: boolean;
  /** Started from the Abyss launcher (which then installs this app's updates). */
  abyss: AbyssContext;
}

export type Severity = "info" | "warn" | "error";

/** `core::Issue`: something to look at; the job carried on past it. */
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  path?: string;
}

/** `{ jobId, done, total, message }` on every `<module>://progress` event. */
export interface JobProgressEvent {
  jobId: number;
  done: number;
  total: number;
  message: string;
}

// ---------------------------------------------------------------- Folder Stats (sample module)

export interface StatsOptions {
  recursive: boolean;
  /** Globs on the relative path or the file name. */
  exclude: string[];
}

export interface ExtStats {
  ext: string;
  files: number;
  bytes: number;
}

export interface StatsReport {
  root: string;
  files: number;
  bytes: number;
  byExt: ExtStats[];
  largest: { path: string; bytes: number }[];
  issues: Issue[];
  elapsedMs: number;
  ok: boolean;
  cancelled: boolean;
}

// ---------------------------------------------------------------- watch

export interface WatchConfig {
  paths: string[];
  recursive: boolean;
  include: string[];
  exclude: string[];
  /** The action's own output folders. */
  ignore: string[];
  debounceMs: number;
  settleMs: number;
}

/** `commands::watch_cmd::WatchAction`; apps add their own kinds. */
export type WatchAction = { kind: "folderStats"; path: string; options: StatsOptions };

export interface WatchRequest {
  action: WatchAction;
  config?: Partial<WatchConfig> | null;
}

/** `app_data_dir()/settings.json`; each app defines its fields. */
export type AppSettings = Record<string, unknown>;


