import { ProgressBar } from "@abyss/ui";
import { formatBytes } from "../lib/format";
import type { JobEvent } from "../lib/types";

const LABELS: Record<JobEvent["phase"], string> = {
  resolving: "Finding the latest release…",
  downloading: "Downloading",
  verifying: "Checking signature…",
  installing: "Installing…",
  uninstalling: "Uninstalling…",
  done: "Done",
  error: "Failed",
};

export function jobBusy(job: JobEvent | null | undefined) {
  return !!job && job.phase !== "done" && job.phase !== "error";
}

/** One-line status + bar for a running job. */
export function JobProgress({ job }: { job: JobEvent }) {
  const downloading = job.phase === "downloading";
  const total = job.total ?? 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2 text-[11.5px] text-ink-muted">
        <span className="truncate">{LABELS[job.phase]}</span>
        {downloading && <span className="tabular-nums">{total ? `${formatBytes(job.downloaded)} / ${formatBytes(total)}` : formatBytes(job.downloaded)}</span>}
      </div>
      <ProgressBar value={job.downloaded} total={total} indeterminate={!downloading || !total} />
    </div>
  );
}
