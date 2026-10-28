import { Checkbox, FieldLabel, Modal, PathText, cn } from "@abyss/ui";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowDownToLine, FolderOpen, HardDrive, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { formatBytes } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { CatalogApp, InstallTarget } from "../lib/types";
import { useLauncher } from "../stores/launcherStore";
import { toast, useUiStore } from "../stores/uiStore";
import { AppIcon } from "./AppIcon";

/** Below this much free space the drive line turns amber. */
const LOW_SPACE = 2 * 1024 ** 3;

/**
 * Picking the app's own folder (`D:\Apps\Poseidon`) means its parent: an app always gets
 * `<root>\<product>`, so a pick of the product folder itself must not nest it twice.
 */
export function rootFor(picked: string, product: string): string {
  const parts = picked.replace(/[\\/]+$/, "").split(/[\\/]/);
  if (parts.length < 2 || parts.at(-1)!.toLowerCase() !== product.toLowerCase()) return picked;
  const parent = parts.slice(0, -1).join("\\");
  return /^[a-z]:$/i.test(parent) ? `${parent}\\` : parent;
}

/** Asked before a new install (unless Settings turned it off): the folder, and a desktop shortcut or not. */
export function InstallDialog() {
  const id = useUiStore((s) => s.installId);
  const app = useLauncher((s) => s.catalog?.catalog.apps.find((a) => a.id === id));
  if (!id || !app?.install) return null;
  // Keyed: every opening starts from the settings again.
  return <InstallForm key={id} app={app} product={app.install.uninstallKey} />;
}

function InstallForm({ app, product }: { app: CatalogApp; product: string }) {
  const t = useT();
  const close = useUiStore((s) => s.setInstallId);
  const settings = useLauncher((s) => s.settings);
  const defaultRoot = useLauncher((s) => s.info?.defaultInstallRoot);
  const version = useLauncher((s) => s.latest[app.id]?.latest?.version);
  const install = useLauncher((s) => s.install);
  const saveSettings = useLauncher((s) => s.saveSettings);
  /** null: the folder from the settings. */
  const [root, setRoot] = useState<string | null>(null);
  const [target, setTarget] = useState<InstallTarget | null>(null);
  const [shortcut, setShortcut] = useState(settings?.desktopShortcut ?? true);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let live = true;
    ipc.installTarget(app.id, root).then(
      (x) => live && setTarget(x),
      (e) => toast("error", String(e)),
    );
    return () => {
      live = false;
    };
  }, [app.id, root]);

  const browse = async () => {
    const picked = await open({ directory: true, multiple: false, title: t.install.pickTitle, defaultPath: target?.root });
    if (typeof picked === "string") setRoot(rootFor(picked, product));
  };

  const go = () => {
    if (!target?.writable) return;
    close(null);
    if (remember) void saveSettings({ installRoot: target.isDefault ? null : target.root, desktopShortcut: shortcut });
    void install(app.id, { root: target.root, desktopShortcut: shortcut });
  };

  const drive = target?.root.match(/^[a-z]:/i)?.[0].toUpperCase();
  const low = target?.free != null && target.free < LOW_SPACE;

  return (
    <Modal
      open
      onClose={() => close(null)}
      title={t.install.title(app.name)}
      closeLabel={t.common.close}
      footer={
        <>
          <button type="button" className="btn" onClick={() => close(null)}>
            {t.install.cancel}
          </button>
          <button type="button" className="btn btn-primary" disabled={!target?.writable} onClick={go}>
            <ArrowDownToLine className="size-3.5" /> {t.install.install}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <AppIcon name={app.name} icon={app.icon} className="size-12" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold text-ink">{app.name}</span>
              {version && <span className="text-[12px] text-ink-faint tabular-nums">v{version}</span>}
            </div>
            {app.tagline && <div className="truncate text-[12px] text-ink-muted">{app.tagline}</div>}
          </div>
        </div>

        <div>
          <FieldLabel>{t.install.location}</FieldLabel>
          <div className="flex items-center gap-2 rounded-lg border border-edge bg-canvas/60 p-1.5 pl-2.5">
            <HardDrive className="size-4 shrink-0 text-ink-faint" />
            <PathText path={target?.root ?? "…"} className="min-w-0 flex-1 text-left text-ink" />
            {target && !target.isDefault && defaultRoot && (
              <button type="button" className="icon-btn" title={t.install.useDefault} aria-label={t.install.useDefault} onClick={() => setRoot(defaultRoot)}>
                <RotateCcw className="size-3.5" />
              </button>
            )}
            <button type="button" className="btn" onClick={() => void browse()}>
              <FolderOpen className="size-3.5" /> {t.install.change}
            </button>
          </div>
          {target && (
            <div className="mt-2 grid gap-1 text-[11.5px]">
              <div className="flex min-w-0 items-baseline gap-1.5 text-ink-faint">
                <span className="shrink-0">{t.install.goesTo}</span>
                <span className="truncate font-mono text-ink-muted select-text" title={target.dir}>
                  {target.dir}
                </span>
              </div>
              {target.free != null && drive && (
                <div className={cn("text-ink-faint", low && "text-amber")}>
                  {t.install.free(formatBytes(target.free), drive)}
                  {low && ` · ${t.install.lowSpace}`}
                </div>
              )}
            </div>
          )}
          {target && !target.writable && (
            <p className="mt-2 flex gap-2 rounded-md bg-rose/10 px-2.5 py-2 text-[12px] text-rose">
              <TriangleAlert className="mt-px size-3.5 shrink-0" /> {t.install.notWritable}
            </p>
          )}
          {target?.writable && target.notEmpty && (
            <p className="mt-2 flex gap-2 rounded-md bg-amber/10 px-2.5 py-2 text-[12px] text-amber">
              <TriangleAlert className="mt-px size-3.5 shrink-0" /> {t.install.notEmpty}
            </p>
          )}
        </div>

        <div className="grid gap-2.5">
          <Checkbox checked={shortcut} onChange={setShortcut} label={t.install.desktopShortcut} hint={t.install.desktopShortcutHint} />
          <Checkbox checked={remember} onChange={setRemember} label={t.install.remember} hint={t.install.rememberHint} />
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald" /> {t.install.perUser}
        </p>
      </div>
    </Modal>
  );
}
