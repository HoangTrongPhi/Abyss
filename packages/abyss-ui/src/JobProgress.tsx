import { useEffect, useState } from "react";
import { ProgressBar } from "./Controls";
import { Clock } from "./icons";

const fmtElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A running job: bar (indeterminate until `total` is known), current message, elapsed time, Cancel. */
export function JobProgress({ done, total, message, startedAt, onCancel, cancelling }: {
  done: number;
  total: number;
  message: string;
  /** Unix ms. */
  startedAt: number;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-edge bg-panel-raised/50 px-3 py-2">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="min-w-0 flex-1 truncate text-ink-muted" title={message}>
          {message || "Working…"}
        </span>
        {total > 0 && (
          <span className="shrink-0 font-mono text-[11px] text-ink-faint tabular-nums">
            {done.toLocaleString()} / {total.toLocaleString()}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-faint tabular-nums">
          <Clock className="size-3" />
          {fmtElapsed(Math.max(0, now - startedAt))}
        </span>
        {onCancel && (
          <button type="button" className="btn btn-danger h-6 px-2 text-[11.5px]" onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      <ProgressBar value={done} total={total} indeterminate={total <= 0} />
    </div>
  );
}
