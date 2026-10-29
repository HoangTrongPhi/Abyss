/**
 * Dev-only fake backend so the UI can be exercised in a plain browser: `npm run dev`, then open
 * `http://localhost:__PORT__/?mock`. Never active in production builds or inside Tauri.
 * It answers every command in `src/lib/ipc.ts` (checked by `npm run check:mock`) and the plugin
 * commands the UI uses; long jobs emit real progress events so Cancel works.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { StatsReport, WatchStatus } from "../types/__APP_ID__";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOT = "D:\\Projects\\Game\\Assets";

let nextJob = 1;
const cancelled = new Set<number>();
const watches = new Map<number, { timer: ReturnType<typeof setInterval>; status: WatchStatus }>();
let nextWatch = 1;

/** Realistic numbers with one unreadable file and one warning, so every state of the UI shows. */
function statsReport(path: string, partial: boolean): StatsReport {
  const byExt = [
    { ext: "png", files: 1284, bytes: 812_400_000 },
    { ext: "fbx", files: 96, bytes: 402_000_000 },
    { ext: "wav", files: 212, bytes: 188_300_000 },
    { ext: "json", files: 340, bytes: 4_100_000 },
    { ext: "", files: 3, bytes: 12_000 },
  ];
  const scale = partial ? 0.4 : 1;
  const ext = byExt.map((e) => ({ ...e, files: Math.round(e.files * scale), bytes: Math.round(e.bytes * scale) }));
  return {
    root: path,
    files: ext.reduce((n, e) => n + e.files, 0),
    bytes: ext.reduce((n, e) => n + e.bytes, 0),
    byExt: ext,
    largest: [
      { path: `${path}\\Characters\\Hero\\SK_Hero.fbx`, bytes: 48_200_000 },
      { path: `${path}\\Textures\\T_Terrain_D.png`, bytes: 22_400_000 },
      { path: `${path}\\Audio\\Music\\theme_loop.wav`, bytes: 18_900_000 },
      { path: `${path}\\Textures\\T_Terrain_N.png`, bytes: 16_100_000 },
    ],
    issues: [
      { severity: "error", code: "unreadable-file", message: "Access is denied. (os error 5)", path: `${path}\\Locked\\perforce.lock` },
      { severity: "warn", code: "unreadable-entry", message: "IO error for operation on Junction: The system cannot find the path specified.", path: `${path}\\OldLink` },
    ],
    elapsedMs: partial ? 380 : 1240,
    ok: false,
    cancelled: partial,
  };
}

const log = (level: string, source: string, message: string) => emit("log://entry", { tsMs: Date.now(), level, source, message });

if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) {
  console.info("mockBackend: active (?mock)");
  // `isTauri()` reads this flag; set it before lib/ipc.ts evaluates `inTauri`.
  (globalThis as { isTauri?: boolean }).isTauri = true;
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      switch (cmd) {
        case "app_info":
          return { version: "0.1.0-mock", debug: true, abyss: { managed: true, launcherVersion: "0.1.0" } };
        case "log_history":
          return [
            { tsMs: Date.now() - 2000, level: "info", source: "app", message: "__APP_NAME__ started (mock backend)" },
            { tsMs: Date.now() - 1000, level: "debug", source: "app", message: "Debug lines are hidden until you click the debug pill" },
          ];
        case "ui_log":
          return null;
        case "cancel_job":
          cancelled.add(a.jobId);
          return true;
        case "open_url":
          window.open(a.url, "_blank", "noopener");
          return null;
        case "reveal_in_explorer":
          console.info("mockBackend: reveal", a.path);
          return null;
        case "get_settings":
          return JSON.parse(localStorage.getItem("__APP_ID__.mock-settings") ?? "{}");
        case "set_settings":
          localStorage.setItem("__APP_ID__.mock-settings", JSON.stringify(a.settings));
          return null;

        case "folder_stats": {
          if (String(a.path).includes("missing")) throw `Folder not found: ${a.path}`;
          const jobId = nextJob++;
          await emit("stats://progress", { jobId, done: 0, total: 0, message: "Starting…" });
          for (let i = 1; i <= 10; i++) {
            await sleep(250);
            if (cancelled.has(jobId)) {
              await log("warn", "stats", `${a.path}: cancelled`);
              return statsReport(a.path, true);
            }
            await emit("stats://progress", { jobId, done: i * 193, total: 1935, message: `Textures\\T_Rock_${String(i).padStart(2, "0")}_D.png` });
          }
          await log("info", "stats", `${a.path}: 1935 file(s), 1.3 GB in 1240 ms`);
          return statsReport(a.path, false);
        }

        case "watch_start": {
          const watchId = nextWatch++;
          let runs = 0;
          const status: WatchStatus = { watchId, state: "idle", lastRunAt: Date.now(), lastDurationMs: 410, lastSummary: "1935 file(s), 1.3 GB", lastError: null, lastIssues: 2, changedPaths: [] };
          const tick = async () => {
            runs++;
            // Every third run fails, to show the red pill.
            const failed = runs % 3 === 0;
            Object.assign(status, {
              state: failed ? "error" : "idle",
              lastRunAt: Date.now(),
              lastDurationMs: 300 + Math.round(Math.random() * 300),
              lastError: failed ? `Folder not found: ${ROOT} (drive disconnected?)` : null,
              changedPaths: [`${ROOT}\\Textures\\T_Rock_0${runs % 9}_D.png`],
            });
            await emit("watch://status", { ...status });
            await log(failed ? "error" : "info", "watch", failed ? String(status.lastError) : `Re-ran (1 change(s)): ${status.lastSummary}`);
          };
          watches.set(watchId, { timer: setInterval(() => void tick(), 5000), status });
          setTimeout(() => void emit("watch://status", { ...status }), 300);
          return watchId;
        }
        case "watch_stop": {
          const w = watches.get(a.watchId);
          if (w) clearInterval(w.timer);
          return watches.delete(a.watchId);
        }
        case "watch_list":
          return [...watches.values()].map((w) => w.status);

        case "plugin:dialog|open":
          return a.options?.directory ? ROOT : a.options?.multiple ? [`${ROOT}\\a.png`, `${ROOT}\\b.png`] : `${ROOT}\\a.png`;
        case "plugin:dialog|save":
          return `${ROOT}\\saved.json`;
        case "plugin:updater|check":
          return { rid: 1, currentVersion: "0.1.0-mock", version: "0.2.0", date: "2026-11-01T00:00:00Z", body: "- Faster scans", rawJson: {} };
        case "plugin:updater|download_and_install":
          await sleep(1500);
          return null;
        case "plugin:window|set_theme":
        case "plugin:webview|set_webview_zoom":
          return null;
        case "plugin:process|restart":
          location.reload();
          return null;
        default:
          if (cmd.startsWith("plugin:event|")) return 0;
          console.warn("mockBackend: unhandled", cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
