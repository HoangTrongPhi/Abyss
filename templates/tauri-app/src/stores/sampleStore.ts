import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerDropHandler } from "../lib/dropRouter";
import { inTauri, ipc, on } from "../lib/ipc";
import type { JobProgressEvent, StatsOptions, StatsReport, WatchStatus } from "../types/__APP_ID__";
import { errorText, uiLog } from "./appStore";

/** The running job as the UI shows it (JobProgress). */
export interface RunningJob extends JobProgressEvent {
  startedAt: number;
  cancelling: boolean;
}

interface SampleState {
  folder: string | null;
  options: StatsOptions;
  setFolder: (folder: string | null) => void;
  setOptions: (o: Partial<StatsOptions>) => void;

  job: RunningJob | null;
  report: StatsReport | null;
  error: string | null;
  run: () => Promise<void>;
  cancel: () => Promise<void>;

  watch: WatchStatus | null;
  startWatch: () => Promise<void>;
  stopWatch: () => Promise<void>;
}

export const useSampleStore = create<SampleState>()(
  persist(
    (set, get) => ({
      folder: null,
      options: { recursive: true, exclude: [] },
      setFolder: (folder) => set({ folder, report: null, error: null }),
      setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),

      job: null,
      report: null,
      error: null,

      async run() {
        const { folder, options, job } = get();
        if (!folder || job || !inTauri) return;
        set({ job: { jobId: 0, done: 0, total: 0, message: "Starting…", startedAt: Date.now(), cancelling: false }, error: null });
        const unlisten = await on.statsProgress((p) => set((s) => (s.job ? { job: { ...s.job, ...p } } : {})));
        try {
          const report = await ipc.folderStats(folder, options);
          set({ report });
          if (report.cancelled) uiLog("warn", "Folder Stats was cancelled; the result is partial");
        } catch (e) {
          set({ error: errorText(e) });
          uiLog("error", errorText(e), "stats");
        } finally {
          unlisten();
          set({ job: null });
        }
      },

      async cancel() {
        const job = get().job;
        if (!job || !job.jobId) return;
        set({ job: { ...job, cancelling: true } });
        await ipc.cancelJob(job.jobId);
      },

      watch: null,
      async startWatch() {
        const { folder, options } = get();
        if (!folder || !inTauri) return;
        try {
          const watchId = await ipc.watchStart({ action: { kind: "folderStats", path: folder, options } });
          set({ watch: { watchId, state: "running", lastRunAt: null, lastDurationMs: null, lastSummary: null, lastError: null, lastIssues: null, changedPaths: [] } });
        } catch (e) {
          uiLog("error", `Watch: ${errorText(e)}`, "watch");
        }
      },
      async stopWatch() {
        const w = get().watch;
        if (!w) return;
        set({ watch: null });
        await ipc.watchStop(w.watchId).catch((e) => uiLog("error", errorText(e), "watch"));
      },
    }),
    // Only the inputs are remembered; results and watches never outlive the window.
    { name: "__APP_ID__.sample", partialize: (s) => ({ folder: s.folder, options: s.options }) },
  ),
);

// Watch status updates (for any watch this store started).
if (inTauri) {
  void on.watch((s) => {
    const w = useSampleStore.getState().watch;
    if (w && w.watchId === s.watchId) useSampleStore.setState({ watch: s });
  });
}

// A dropped or picked folder becomes the scan root.
registerDropHandler("stats", (paths) => {
  if (paths.length) useSampleStore.getState().setFolder(paths[0]);
});
