import { PillBadge, cn, spotlight } from "@abyss/ui";
import { ask } from "@tauri-apps/plugin-dialog";
import { ArrowDownToLine, BellRing, ExternalLink, FolderOpen, Info, Play, RefreshCw, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useT, type Messages } from "../i18n";
import { fileName } from "../lib/format";
import { ipc } from "../lib/ipc";
import { useLauncher, type AppView } from "../stores/launcherStore";
import { toast, useUiStore } from "../stores/uiStore";
import { AppIcon } from "./AppIcon";
import { JobProgress, jobBusy } from "./JobProgress";
import { Menu, type MenuItem } from "./Menu";

function versionLine(v: AppView, t: Messages["card"]): string {
  if (v.kind === "local") return v.status?.installed ? fileName(v.local!.path) : t.fileNotFound;
  const installed = v.status?.installed?.version;
  const latest = v.latest?.latest?.version;
  if (installed && v.latest?.updateAvailable) return `v${installed} → v${latest}`;
  if (installed) return `v${installed}`;
  if (v.app?.status === "coming_soon") return t.inDevelopment;
  return latest ? t.versionAvailable(latest) : t.notInstalled;
}

export function AppCard({ view: v }: { view: AppView }) {
  const t = useT();
  const install = useLauncher((s) => s.install);
  const requestInstall = useLauncher((s) => s.requestInstall);
  const uninstall = useLauncher((s) => s.uninstall);
  const launch = useLauncher((s) => s.launch);
  const toggleQueued = useLauncher((s) => s.toggleQueued);
  const removeLocal = useLauncher((s) => s.removeLocalApp);
  const setDetailsId = useUiStore((s) => s.setDetailsId);

  const installed = !!v.status?.installed;
  const running = !!v.status?.running;
  const update = !!v.latest?.updateAvailable;
  const busy = jobBusy(v.job);
  const comingSoon = v.app?.status === "coming_soon";
  const accent = v.app?.accent ?? "#3b82f6";
  const exe = v.status?.installed?.exe ?? null;

  const menu: MenuItem[] = [];
  if (v.kind === "catalog") menu.push({ label: t.card.details, icon: <Info />, onSelect: () => setDetailsId(v.id) });
  if (exe) menu.push({ label: t.card.showInExplorer, icon: <FolderOpen />, onSelect: () => void ipc.revealPath(exe).catch((e) => toast("error", String(e))) });
  if (v.app?.homepage) menu.push({ label: t.common.projectPage, icon: <ExternalLink />, onSelect: () => void ipc.openUrl(v.app!.homepage!).catch(() => {}) });
  if (v.kind === "catalog" && installed) menu.push({ label: t.card.uninstall, icon: <Trash2 />, danger: true, disabled: busy || running, onSelect: () => void ask(t.card.confirmUninstall(v.name), { title: "Abyss", kind: "warning" }).then((ok) => void (ok && uninstall(v.id))) });
  if (v.kind === "local") menu.push({ label: t.card.removeLocal, icon: <Trash2 />, danger: true, onSelect: () => void removeLocal(v.id) });

  let action: ReactNode;
  if (busy) action = null;
  else if (comingSoon) action = <PillBadge>{t.common.comingSoon}</PillBadge>;
  else if (!installed && v.kind === "local") action = null;
  else if (!installed)
    action = (
      <button type="button" className="btn btn-primary" onClick={() => requestInstall(v.id)}>
        <ArrowDownToLine className="size-3.5" /> {t.common.install}
      </button>
    );
  else if (update && running)
    action = (
      <button type="button" className={cn("btn", v.queued && "border-accent/50 text-accent")} title={t.common.updateOnCloseHint} onClick={() => toggleQueued(v.id)}>
        <BellRing className="size-3.5" /> {v.queued ? t.common.updatesOnClose : t.common.updateOnClose}
      </button>
    );
  else if (update)
    action = (
      <>
        <button type="button" className="btn" onClick={() => void launch(v.id)}>
          {t.common.open}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void install(v.id)}>
          <RefreshCw className="size-3.5" /> {t.common.update}
        </button>
      </>
    );
  else
    action = (
      <button type="button" className="btn btn-primary" onClick={() => void launch(v.id)}>
        <Play className="size-3.5 fill-current" /> {t.common.open}
      </button>
    );

  return (
    <article
      className={cn("fx-card group flex min-h-[168px] flex-col overflow-hidden rounded-xl border border-edge bg-panel p-4 hover:border-edge-strong", comingSoon && "opacity-75")}
      style={{ "--fx-tint": accent } as CSSProperties}
      onPointerMove={spotlight}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-60" style={{ background: `linear-gradient(180deg, ${accent}22, transparent)` }} />
      <div className="relative flex gap-3">
        <AppIcon name={v.name} icon={v.app?.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-ink">{v.name}</h3>
            {running && (
              <span className="flex items-center gap-1 text-[11px] text-emerald">
                <span className="size-1.5 rounded-full bg-emerald" /> {t.card.running}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{v.kind === "local" ? t.card.yourApp : v.app?.tagline}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {v.app?.category && <PillBadge>{v.app.category}</PillBadge>}
            {v.app?.status === "beta" && <PillBadge tone="amber">{t.card.beta}</PillBadge>}
            {v.kind === "local" && <PillBadge>{t.card.local}</PillBadge>}
            {update && <PillBadge tone="accent">{t.common.update}</PillBadge>}
          </div>
        </div>
      </div>
      <div className="relative mt-auto pt-3">
        {busy ? (
          <JobProgress job={v.job!} />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-[11.5px] text-ink-faint tabular-nums", v.kind === "local" && "font-mono")} title={v.local?.path}>
              {versionLine(v, t.card)}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {action}
              {menu.length > 0 && <Menu items={menu} />}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
