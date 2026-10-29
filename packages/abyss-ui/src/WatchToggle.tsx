import { cn } from "./cn";
import { Eye } from "./icons";

/** Payload of `watch://status` (Rust `utils/watch.rs`). */
export interface WatchStatus {
  watchId: number;
  state: "idle" | "running" | "error";
  /** Unix ms of the last finished run. */
  lastRunAt: number | null;
  lastDurationMs: number | null;
  lastSummary: string | null;
  lastError: string | null;
  /** Issues of the last run (warn + error). */
  lastIssues?: number | null;
  changedPaths: string[];
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour12: false });
const fmtSecs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

/** One line describing a watch, e.g. `Watching · last run 12:03:41 · 0.4 s · 0 issues`. */
export function describeWatch(s: WatchStatus): string {
  const parts = [s.state === "running" ? "Running…" : s.state === "error" ? "Watch error" : "Watching"];
  if (s.lastRunAt != null) parts.push(`last run ${fmtTime(s.lastRunAt)}`);
  if (s.lastDurationMs != null) parts.push(fmtSecs(s.lastDurationMs));
  if (s.lastIssues != null) parts.push(`${s.lastIssues} issue${s.lastIssues === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/**
 * Header control of a module that can re-run on file changes: a Watch button while off, a status pill
 * while on (red on error; `onErrorClick` usually opens the log drawer).
 */
export function WatchToggle({ status, onStart, onStop, onErrorClick, disabled }: {
  status: WatchStatus | null;
  onStart: () => void;
  onStop: () => void;
  onErrorClick?: () => void;
  disabled?: boolean;
}) {
  if (!status) {
    return (
      <button type="button" className="btn" onClick={onStart} disabled={disabled} title="Run again whenever an input file changes">
        <Eye className="size-3.5" /> Watch
      </button>
    );
  }
  const error = status.state === "error";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={error ? onErrorClick : undefined}
        title={status.lastError ?? status.lastSummary ?? undefined}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium tabular-nums ring-1 ring-inset whitespace-nowrap",
          error ? "bg-rose/12 text-rose ring-rose/30" : "bg-emerald/12 text-emerald ring-emerald/25",
          !error && "cursor-default",
        )}
      >
        <span className={cn("size-1.5 rounded-full", error ? "bg-rose" : "bg-emerald", status.state === "running" && "fx-loop animate-pulse")} />
        {describeWatch(status)}
      </button>
      <button type="button" className="btn" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}
