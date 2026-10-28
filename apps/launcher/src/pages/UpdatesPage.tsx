import { EmptyState, GlassCard, PillBadge, ProgressBar } from "@abyss/ui";
import { BellRing, CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { JobProgress, jobBusy } from "../components/JobProgress";
import { useT } from "../i18n";
import { formatBytes, formatDate, formatTime } from "../lib/format";
import { useAppViews, useLauncher, type AppView } from "../stores/launcherStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";

function SelfUpdateCard() {
  const t = useT();
  const u = t.updates;
  const s = useSelfUpdate();
  const version = useLauncher((st) => st.info?.version);
  const busy = s.phase === "downloading" || s.phase === "installing";
  return (
    <GlassCard className="flex items-center gap-4 p-4">
      <img src="/abyss-icon.svg" alt="" className="size-11" draggable={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          Abyss <span className="text-[12px] font-normal text-ink-faint">v{version}</span>
        </div>
        <div className="text-[12px] text-ink-muted">
          {s.phase === "available" && u.selfAvailable(s.available?.version ?? "")}
          {s.phase === "upToDate" && u.selfUpToDate}
          {s.phase === "checking" && u.selfChecking}
          {s.phase === "idle" && u.selfIdle}
          {s.phase === "error" && <span className="text-rose">{s.error}</span>}
          {busy && (s.phase === "installing" ? u.selfInstalling : u.selfDownloading(`${formatBytes(s.downloaded)}${s.total ? ` / ${formatBytes(s.total)}` : ""}`))}
        </div>
        {busy && (
          <div className="mt-2">
            <ProgressBar value={s.downloaded} total={s.total} indeterminate={!s.total || s.phase === "installing"} />
          </div>
        )}
      </div>
      {s.phase === "available" ? (
        <button type="button" className="btn btn-primary" onClick={() => void s.installAndRestart()}>
          {t.common.installAndRestart}
        </button>
      ) : (
        <button type="button" className="btn" disabled={busy || s.phase === "checking"} onClick={() => void s.check()}>
          {u.check}
        </button>
      )}
    </GlassCard>
  );
}

function UpdateRow({ v }: { v: AppView }) {
  const t = useT();
  const install = useLauncher((s) => s.install);
  const toggleQueued = useLauncher((s) => s.toggleQueued);
  const [open, setOpen] = useState(false);
  const release = v.latest!.latest!;
  const running = !!v.status?.running;
  return (
    <div className="border-b border-edge px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <AppIcon name={v.name} icon={v.app?.icon} className="size-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink">{v.name}</div>
          <div className="text-[11.5px] text-ink-faint tabular-nums">
            v{v.status?.installed?.version} → v{release.version}
            {formatDate(release.pubDate) && ` · ${formatDate(release.pubDate)}`}
            {release.notes && (
              <button type="button" className="ml-2 text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
                {open ? t.common.hideNotes : t.common.whatsNew}
              </button>
            )}
          </div>
        </div>
        {jobBusy(v.job) ? (
          <div className="w-56">
            <JobProgress job={v.job!} />
          </div>
        ) : running ? (
          <button type="button" className={v.queued ? "btn border-accent/50 text-accent" : "btn"} onClick={() => toggleQueued(v.id)} title={t.common.updateOnCloseHint}>
            <BellRing className="size-3.5" /> {v.queued ? t.common.updatesOnClose : t.common.updateOnClose}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void install(v.id)}>
            <RefreshCw className="size-3.5" /> {t.common.update}
          </button>
        )}
      </div>
      {open && <p className="mt-2 ml-12 rounded-md bg-canvas/50 p-2.5 text-[12px] whitespace-pre-wrap text-ink-muted select-text">{release.notes}</p>}
    </div>
  );
}

export function UpdatesPage() {
  const t = useT().updates;
  const views = useAppViews();
  const lastChecked = useLauncher((s) => s.lastChecked);
  const updateAll = useLauncher((s) => s.updateAll);
  const pending = views.filter((v) => v.latest?.updateAvailable);
  const current = views.filter((v) => v.status?.installed && v.kind === "catalog" && !v.latest?.updateAvailable);

  return (
    <div className="grid max-w-4xl gap-6">
      <SelfUpdateCard />
      <GlassCard
        title={
          <span className="flex items-center gap-2">
            {t.appUpdates} {pending.length > 0 && <PillBadge tone="accent">{pending.length}</PillBadge>}
          </span>
        }
        actions={
          <>
            <span className="text-[11.5px] text-ink-faint normal-case">{lastChecked ? t.checkedAt(formatTime(lastChecked)) : t.notChecked}</span>
            {pending.length > 1 && (
              <button type="button" className="btn btn-primary" onClick={() => void updateAll()}>
                {t.updateAll}
              </button>
            )}
          </>
        }
      >
        {pending.length ? (
          pending.map((v) => <UpdateRow key={v.id} v={v} />)
        ) : (
          <EmptyState icon={<CheckCircle2 className="size-4" />} title={t.allUpToDate}>
            {t.allUpToDateHint}
          </EmptyState>
        )}
      </GlassCard>
      {current.length > 0 && (
        <GlassCard title={t.upToDate}>
          {current.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-b border-edge px-4 py-2.5 last:border-b-0">
              <AppIcon name={v.name} icon={v.app?.icon} className="size-7 rounded-md" />
              <span className="flex-1 text-[12.5px] text-ink">{v.name}</span>
              <span className="text-[11.5px] text-ink-faint tabular-nums">v{v.status?.installed?.version}</span>
              {v.latest?.error && <PillBadge tone="amber">{v.latest.error.includes("no published release") ? t.noRelease : t.checkFailed}</PillBadge>}
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
