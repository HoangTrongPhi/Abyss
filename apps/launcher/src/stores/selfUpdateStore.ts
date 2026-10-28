import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { inTauri } from "../lib/ipc";

/**
 * Abyss updating itself: `latest.json` of the newest Abyss GitHub release (`plugins.updater` in
 * tauri.conf.json), installer verified with the signing public key before it runs.
 */
export type SelfPhase = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "error";

/** Silent check this long after startup, after the app checks. */
const STARTUP_DELAY_MS = 6000;

interface SelfUpdateState {
  phase: SelfPhase;
  available: { version: string; date?: string; notes?: string } | null;
  downloaded: number;
  total: number;
  error: string | null;
  check: (opts?: { silent?: boolean }) => Promise<void>;
  installAndRestart: () => Promise<void>;
}

let pending: Update | null = null;

export const useSelfUpdate = create<SelfUpdateState>()((set, get) => ({
  phase: "idle",
  available: null,
  downloaded: 0,
  total: 0,
  error: null,

  async check({ silent = false } = {}) {
    if (!inTauri) return;
    const busy = get().phase;
    if (busy === "checking" || busy === "downloading" || busy === "installing") return;
    set({ phase: "checking", error: null });
    try {
      pending = await check();
      set(pending ? { phase: "available", available: { version: pending.version, date: pending.date, notes: pending.body } } : { phase: "upToDate", available: null });
    } catch (e) {
      // No Abyss release published yet, or offline: quiet at startup, explained when asked.
      set({ phase: silent ? "idle" : "error", error: String(e) });
    }
  },

  async installAndRestart() {
    if (!pending) return;
    set({ phase: "downloading", downloaded: 0, total: 0, error: null });
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") set({ total: event.data.contentLength ?? 0 });
        else if (event.event === "Progress") set((s) => ({ downloaded: s.downloaded + event.data.chunkLength }));
        else if (event.event === "Finished") set({ phase: "installing" });
      });
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: String(e) });
    }
  },
}));

/** Once per launch, in release builds only (a dev build would offer to replace itself). */
export function scheduleSelfUpdateCheck(debug: boolean) {
  if (!inTauri || debug) return;
  setTimeout(() => void useSelfUpdate.getState().check({ silent: true }), STARTUP_DELAY_MS);
}
