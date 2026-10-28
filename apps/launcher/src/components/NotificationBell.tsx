import { EmptyState, PillBadge, cn } from "@abyss/ui";
import { Bell, Check, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { timeAgo, useT } from "../i18n";
import { useLauncher } from "../stores/launcherStore";
import { SELF_ID, useNotifications, useUnreadCount, type Notice } from "../stores/notificationStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";
import { useUiStore } from "../stores/uiStore";
import { AppIcon } from "./AppIcon";
import { JobProgress, jobBusy } from "./JobProgress";

/** What a notice can still do: install its version, or say it is in. */
function NoticeActions({ n, onLeave }: { n: Notice; onLeave: () => void }) {
  const t = useT();
  const isSelf = n.appId === SELF_ID;
  const latest = useLauncher((s) => s.latest[n.appId]);
  const status = useLauncher((s) => s.states[n.appId]);
  const job = useLauncher((s) => s.jobs[n.appId]);
  const queued = useLauncher((s) => s.queued.includes(n.appId));
  const launcherVersion = useLauncher((s) => s.info?.version);
  const install = useLauncher((s) => s.install);
  const toggleQueued = useLauncher((s) => s.toggleQueued);
  const self = useSelfUpdate();
  const setPage = useUiStore((s) => s.setPage);
  const setDetailsId = useUiStore((s) => s.setDetailsId);

  if (!isSelf && jobBusy(job)) return <JobProgress job={job!} />;

  const pending = isSelf ? self.phase === "available" && self.available?.version === n.version : !!latest?.updateAvailable && latest.latest?.version === n.version;
  const installed = isSelf ? launcherVersion === n.version : status?.installed?.version === n.version;
  const running = !!status?.running;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pending && isSelf && (
        <button type="button" className="btn btn-primary" disabled={self.phase !== "available"} onClick={() => void self.installAndRestart()}>
          {t.common.installAndRestart}
        </button>
      )}
      {pending && !isSelf && running && (
        <button type="button" className={cn("btn", queued && "border-accent/50 text-accent")} title={t.common.updateOnCloseHint} onClick={() => toggleQueued(n.appId)}>
          {queued ? t.common.updatesOnClose : t.common.updateOnClose}
        </button>
      )}
      {pending && !isSelf && !running && (
        <button type="button" className="btn btn-primary" onClick={() => void install(n.appId)}>
          <RefreshCw className="size-3.5" /> {t.common.update}
        </button>
      )}
      {!pending && installed && (
        <PillBadge tone="emerald">
          <Check className="size-3" /> {t.notifications.installed}
        </PillBadge>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => {
          onLeave();
          if (isSelf) setPage("updates");
          else setDetailsId(n.appId);
        }}
      >
        {isSelf ? t.notifications.seeUpdates : t.notifications.details}
      </button>
    </div>
  );
}

function NoticeRow({ n, fresh, onLeave }: { n: Notice; fresh: boolean; onLeave: () => void }) {
  const t = useT();
  const icon = useLauncher((s) => s.catalog?.catalog.apps.find((a) => a.id === n.appId)?.icon);
  const dismiss = useNotifications((s) => s.dismiss);
  return (
    <div className={cn("group relative flex gap-3 border-b border-edge px-4 py-3 last:border-b-0", fresh && "bg-accent/5")}>
      {fresh && <span className="absolute top-[18px] left-1.5 size-1.5 rounded-full bg-accent" aria-hidden="true" />}
      {n.appId === SELF_ID ? (
        <img src="/abyss-icon.svg" alt="" className="size-9 shrink-0" draggable={false} />
      ) : (
        <AppIcon name={n.name} icon={icon} className="size-9 rounded-lg" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 pr-5">
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{t.notifications.newVersion(n.name, n.version)}</span>
          <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">{timeAgo(n.at)}</span>
        </div>
        {n.notes && <p className="mt-0.5 line-clamp-2 text-[11.5px] whitespace-pre-line text-ink-muted">{n.notes}</p>}
        <div className="mt-2">
          <NoticeActions n={n} onLeave={onLeave} />
        </div>
      </div>
      <button
        type="button"
        className="icon-btn absolute top-2 right-2 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={t.common.dismiss}
        title={t.common.dismiss}
        onClick={() => dismiss(n.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Bell in the top bar: a count of unread notices and, on click, the list of new versions with
 * their Update button. Opening it marks everything as read; what was unread stays highlighted
 * until the panel closes.
 */
export function NotificationBell() {
  const t = useT();
  const unread = useUnreadCount();
  const items = useNotifications((s) => s.items);
  const open = useNotifications((s) => s.open);
  const setOpen = useNotifications((s) => s.setOpen);
  const clear = useNotifications((s) => s.clear);
  const checking = useLauncher((s) => s.checking);
  const checkUpdates = useLauncher((s) => s.checkUpdates);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // Notices that arrive while the panel is open are read at once, but still highlighted.
  useEffect(() => {
    if (!open || !unread) return;
    const { items, markAllRead } = useNotifications.getState();
    setFresh((f) => new Set([...f, ...items.filter((i) => !i.read).map((i) => i.id)]));
    markAllRead();
  }, [open, unread]);

  const toggle = () => {
    if (!open) setFresh(new Set());
    setOpen(!open);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cn("icon-btn relative size-8", open && "bg-tint/6 text-ink")}
        aria-label={unread ? `${t.notifications.open} (${unread})` : t.notifications.open}
        aria-expanded={open}
        title={t.notifications.open}
        onClick={toggle}
      >
        <Bell className={cn("size-[17px]", unread > 0 && "text-ink")} strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-panel">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.notifications.title}
          className="absolute top-full right-0 z-40 mt-2 flex max-h-[min(480px,calc(100vh-5rem))] w-[380px] animate-pop-in flex-col overflow-hidden rounded-xl border border-edge-strong bg-panel-raised shadow-2xl"
        >
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-edge pr-2 pl-4">
            <span className="flex-1 text-[12.5px] font-semibold text-ink">{t.notifications.title}</span>
            <button type="button" className="icon-btn" disabled={checking} aria-label={t.topBar.check} title={t.topBar.check} onClick={() => void checkUpdates()}>
              <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
            </button>
            <button type="button" className="icon-btn disabled:opacity-40" disabled={!items.length} aria-label={t.notifications.clear} title={t.notifications.clear} onClick={clear}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length ? (
              items.map((n) => <NoticeRow key={n.id} n={n} fresh={fresh.has(n.id)} onLeave={() => setOpen(false)} />)
            ) : (
              <EmptyState icon={<Bell className="size-4" />} title={t.notifications.empty}>
                {t.notifications.emptyHint}
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
