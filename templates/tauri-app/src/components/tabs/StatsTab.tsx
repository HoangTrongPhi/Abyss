import { Checkbox, EmptyState, FieldLabel, GlassCard, JobProgress, PathText, PillBadge, TextField, WatchToggle } from "@abyss/ui";
import { AlertTriangle, ChartPie, FolderOpen, FolderSearch, Play, XCircle } from "lucide-react";
import { pickPaths } from "../../lib/dialogs";
import { inTauri, ipc } from "../../lib/ipc";
import { useAppStore } from "../../stores/appStore";
import { useSampleStore } from "../../stores/sampleStore";
import type { Issue } from "../../types/__APP_ID__";

export const fmtBytes = (b: number) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return i ? `${v.toFixed(1)} ${u[i]}` : `${b} B`;
};

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : b.severity === "error" ? 1 : 0));
  return (
    <GlassCard title={`Issues (${issues.length})`}>
      <ul className="divide-y divide-edge">
        {sorted.map((i, n) => (
          <li key={n} className="flex items-start gap-2 px-4 py-2 text-[12px]">
            {i.severity === "error" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber" />}
            <div className="min-w-0 flex-1">
              <div className="text-ink">{i.message}</div>
              {i.path && <PathText path={i.path} className="block text-ink-faint" />}
            </div>
            <code className="shrink-0 font-mono text-[10.5px] text-ink-faint">{i.code}</code>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/** The sample module: pick or drop a folder, Run (progress, Cancel), results, Watch. */
export function StatsTab() {
  const { folder, options, setOptions, job, report, error, run, cancel, watch, startWatch, stopWatch } = useSampleStore();
  const dragActive = useAppStore((s) => s.dragActive);
  const openLog = () => useAppStore.getState().toggleLogDrawer(true);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => void pickPaths("folder")}>
          <FolderOpen className="size-3.5" /> Choose folder…
        </button>
        {folder && <PathText path={folder} className="max-w-md text-ink-muted" />}
        <div className="flex-1" />
        <WatchToggle status={watch} onStart={() => void startWatch()} onStop={() => void stopWatch()} onErrorClick={openLog} disabled={!folder} />
        <button type="button" className="btn btn-primary" disabled={!folder || !!job} onClick={() => void run()} title="F5">
          <Play className="size-3.5" /> Run
        </button>
      </div>

      <GlassCard title="Options">
        <div className="flex flex-wrap items-end gap-6 p-4">
          <Checkbox checked={options.recursive} onChange={(recursive) => setOptions({ recursive })} label="Include subfolders" />
          <div className="min-w-64 flex-1">
            <FieldLabel>Exclude (globs, comma separated)</FieldLabel>
            <TextField
              mono
              className="w-full"
              placeholder="**/*.tmp, build/**"
              value={options.exclude.join(", ")}
              onChange={(e) => setOptions({ exclude: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>
      </GlassCard>

      {job && <JobProgress done={job.done} total={job.total} message={job.message} startedAt={job.startedAt} onCancel={() => void cancel()} cancelling={job.cancelling} />}
      {error && <div className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">{error}</div>}

      {!report && !job && (
        <div className={dragActive ? "rounded-xl border border-dashed border-accent bg-accent/5" : "rounded-xl border border-dashed border-edge"}>
          <EmptyState icon={folder ? <ChartPie className="size-5" /> : <FolderSearch className="size-5" />} title={folder ? "Ready to count" : "Drop a folder here"}>
            {folder ? "Press Run (F5) to count files and bytes by extension." : "Or choose one with the button above. Files are only read, never changed."}
          </EmptyState>
        </div>
      )}

      {report && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PillBadge tone={report.ok ? "emerald" : report.cancelled ? "amber" : "rose"}>{report.cancelled ? "Cancelled — partial" : report.ok ? "Done" : "Done with errors"}</PillBadge>
            <span className="text-[12.5px] text-ink">
              {report.files.toLocaleString()} file(s), {fmtBytes(report.bytes)}
            </span>
            <span className="text-[12px] text-ink-faint">in {report.elapsedMs} ms</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard title="By extension">
              <table className="w-full text-[12px]">
                <tbody>
                  {report.byExt.map((e) => (
                    <tr key={e.ext} className="border-b border-edge last:border-0">
                      <td className="px-4 py-1.5 font-mono text-ink">.{e.ext || "(none)"}</td>
                      <td className="px-4 py-1.5 text-right text-ink-muted tabular-nums">{e.files.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right text-ink tabular-nums">{fmtBytes(e.bytes)}</td>
                      <td className="w-1/3 px-4 py-1.5">
                        <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${report.bytes ? (e.bytes / report.bytes) * 100 : 0}%` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
            <GlassCard title="Largest files">
              <ul className="divide-y divide-edge">
                {report.largest.map((f) => (
                  <li key={f.path} className="flex items-center gap-3 px-4 py-1.5 text-[12px]">
                    <button type="button" className="min-w-0 flex-1 text-left hover:text-accent" disabled={!inTauri} onClick={() => void ipc.revealInExplorer(f.path)} title="Show in Explorer">
                      <PathText path={f.path} className="block text-ink" />
                    </button>
                    <span className="shrink-0 text-ink-muted tabular-nums">{fmtBytes(f.bytes)}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
          <IssueList issues={report.issues} />
        </>
      )}
    </div>
  );
}
