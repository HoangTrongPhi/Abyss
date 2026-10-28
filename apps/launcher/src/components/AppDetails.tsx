import { Modal, PillBadge } from "@abyss/ui";
import { ExternalLink } from "lucide-react";
import { useT } from "../i18n";
import { formatDate } from "../lib/format";
import { ipc } from "../lib/ipc";
import { useLauncher } from "../stores/launcherStore";
import { useUiStore } from "../stores/uiStore";
import { AppIcon } from "./AppIcon";

/** Description, versions and release notes of a catalog app. */
export function AppDetails() {
  const t = useT();
  const id = useUiStore((s) => s.detailsId);
  const close = useUiStore((s) => s.setDetailsId);
  const app = useLauncher((s) => s.catalog?.catalog.apps.find((a) => a.id === id));
  const status = useLauncher((s) => (id ? s.states[id] : undefined));
  const latest = useLauncher((s) => (id ? s.latest[id] : undefined));
  if (!app) return null;
  const release = latest?.latest;

  return (
    <Modal
      open={!!id}
      onClose={() => close(null)}
      title={t.details.title}
      closeLabel={t.common.close}
      footer={
        app.homepage && (
          <button type="button" className="btn" onClick={() => void ipc.openUrl(app.homepage!).catch(() => {})}>
            <ExternalLink className="size-3.5" /> {t.common.projectPage}
          </button>
        )
      }
    >
      <div className="flex gap-3">
        <AppIcon name={app.name} icon={app.icon} className="size-14" />
        <div className="min-w-0">
          <div className="text-[16px] font-semibold text-ink">{app.name}</div>
          <div className="text-[12.5px] text-ink-muted">{app.tagline}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {app.category && <PillBadge>{app.category}</PillBadge>}
            {status?.installed ? <PillBadge tone="emerald">{t.details.installed(status.installed.version)}</PillBadge> : <PillBadge>{t.card.notInstalled}</PillBadge>}
            {latest?.updateAvailable && release && <PillBadge tone="accent">{t.card.versionAvailable(release.version)}</PillBadge>}
          </div>
        </div>
      </div>
      {app.description && <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">{app.description}</p>}
      <div className="mt-4 rounded-lg border border-edge bg-canvas/50 p-3">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{t.details.latestRelease}</span>
          {release && (
            <span className="text-[11.5px] text-ink-faint">
              v{release.version}
              {formatDate(release.pubDate) && ` · ${formatDate(release.pubDate)}`}
            </span>
          )}
        </div>
        <p className="text-[12.5px] whitespace-pre-wrap text-ink select-text">
          {release ? (release.notes ?? t.details.noNotes) : (latest?.error ?? t.details.notChecked)}
        </p>
      </div>
      {status?.installed && (
        <div className="mt-3 truncate font-mono text-[11px] text-ink-faint" title={status.installed.installDir}>
          {status.installed.installDir}
        </div>
      )}
    </Modal>
  );
}
