import { EmptyState, GlassCard, PillBadge, ProgressBar } from "@abyss/ui";
import { BellRing, CheckCircle2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { JobProgress, jobBusy } from "../components/JobProgress";
import { formatBytes, formatDate } from "../lib/format";
import { useAppViews, useLauncher, type AppView } from "../stores/launcherStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";

function SelfUpdateCard() {
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
          {s.phase === "available" && `Version ${s.available?.version} is ready to install. Abyss restarts; your apps keep running.`}
          {s.phase === "upToDate" && "Abyss is up to date."}
          {s.phase === "checking" && "Checking…"}
          {s.phase === "idle" && "Abyss updates itself from its GitHub releases."}
          {s.phase === "error" && <span className="text-rose">{s.error}</span>}
          {busy && (s.phase === "installing" ? "Installing…" : `Downloading ${formatBytes(s.downloaded)}${s.total ? ` / ${formatBytes(s.total)}` : ""}`)}
        </div>
        {busy && (
          <div className="mt-2">
            <ProgressBar value={s.downloaded} total={s.total} indeterminate={!s.total || s.phase === "installing"} />
          </div>
        )}
      </div>
      {s.phase === "available" ? (
        <button type="button" className="btn btn-primary" onClick={() => void s.installAndRestart()}>
          Install & restart
        </button>
      ) : (
        <button type="button" className="btn" disabled={busy || s.phase === "checking"} onClick={() => void s.check()}>
          Check
        </button>
      )}
    </GlassCard>
  );
}

function UpdateRow({ v }: { v: AppView }) {
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
                {open ? "Hide notes" : "What's new"}
              </button>
            )}
          </div>
        </div>
        {jobBusy(v.job) ? (
          <div className="w-56">
            <JobProgress job={v.job!} />
          </div>
        ) : running ? (
          <button type="button" className={v.queued ? "btn border-accent/50 text-accent" : "btn"} onClick={() => toggleQueued(v.id)} title="The app is open; Abyss installs the update when you close it">
            <BellRing className="size-3.5" /> {v.queued ? "Updates on close" : "Update on close"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void install(v.id)}>
            <RefreshCw className="size-3.5" /> Update
          </button>
        )}
      </div>
      {open && <p className="mt-2 ml-12 rounded-md bg-canvas/50 p-2.5 text-[12px] whitespace-pre-wrap text-ink-muted select-text">{release.notes}</p>}
    </div>
  );
}

export function UpdatesPage() {
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
            App updates {pending.length > 0 && <PillBadge tone="accent">{pending.length}</PillBadge>}
          </span>
        }
        actions={
          <>
            <span className="text-[11.5px] text-ink-faint normal-case">{lastChecked ? `Checked ${new Date(lastChecked).toLocaleTimeString()}` : "Not checked yet"}</span>
            {pending.length > 1 && (
              <button type="button" className="btn btn-primary" onClick={() => void updateAll()}>
                Update all
              </button>
            )}
          </>
        }
      >
        {pending.length ? (
          pending.map((v) => <UpdateRow key={v.id} v={v} />)
        ) : (
          <EmptyState icon={<CheckCircle2 className="size-4" />} title="All apps are up to date">
            Running apps are never updated under your feet: Abyss waits until you close them.
          </EmptyState>
        )}
      </GlassCard>
      {current.length > 0 && (
        <GlassCard title="Up to date">
          {current.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-b border-edge px-4 py-2.5 last:border-b-0">
              <AppIcon name={v.name} icon={v.app?.icon} className="size-7 rounded-md" />
              <span className="flex-1 text-[12.5px] text-ink">{v.name}</span>
              <span className="text-[11.5px] text-ink-faint tabular-nums">v{v.status?.installed?.version}</span>
              {v.latest?.error && <PillBadge tone="amber">{v.latest.error.includes("no published release") ? "No release yet" : "Check failed"}</PillBadge>}
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
