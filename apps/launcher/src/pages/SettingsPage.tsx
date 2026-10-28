import { AppearanceSettings, Checkbox, FieldLabel, GlassCard, PathText, PillBadge, TextField, cn } from "@abyss/ui";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, HardDrive, Languages, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGS, useLang, useT } from "../i18n";
import type { Settings } from "../lib/types";
import { useAppearance } from "../stores/appearance";
import { useLauncher } from "../stores/launcherStore";

function LanguagePicker() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div className="grid gap-2 p-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.settings.language}>
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={lang === l.id}
            onClick={() => setLang(l.id)}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-lg border px-3 text-left text-[12.5px] transition-colors",
              lang === l.id ? "border-accent/60 bg-accent/10 text-accent" : "border-edge bg-panel-raised/50 text-ink-muted hover:border-edge-strong hover:text-ink",
            )}
          >
            <span className="grid h-5 w-7 place-items-center rounded bg-tint/8 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">{l.id}</span>
            <span className="font-medium">{l.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">{t.settings.languageHint}</p>
    </div>
  );
}

/** Where new apps go, and whether to ask each time. Updates are not affected: they install in place. */
function InstallSettings({ settings }: { settings: Settings }) {
  const t = useT().settings;
  const defaultRoot = useLauncher((s) => s.info?.defaultInstallRoot ?? "");
  const save = useLauncher((s) => s.saveSettings);
  const root = settings.installRoot ?? defaultRoot;

  const pick = async () => {
    const picked = await open({ directory: true, multiple: false, title: t.installRoot, defaultPath: root || undefined });
    if (typeof picked === "string") void save({ installRoot: picked });
  };

  return (
    <div className="grid gap-3 p-4">
      <div>
        <FieldLabel>{t.installRoot}</FieldLabel>
        <div className="flex items-center gap-2">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-edge bg-canvas/70 px-2">
            <HardDrive className="size-3.5 shrink-0 text-ink-faint" />
            <PathText path={root} className="min-w-0 flex-1 text-left text-ink" />
            {!settings.installRoot && <PillBadge>{t.defaultRoot}</PillBadge>}
          </div>
          {settings.installRoot && (
            <button type="button" className="btn" onClick={() => void save({ installRoot: null })}>
              <RotateCcw className="size-3.5" /> {t.resetRoot}
            </button>
          )}
          <button type="button" className="btn" onClick={() => void pick()}>
            <FolderOpen className="size-3.5" /> {t.change}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">{t.installRootHint(`${root.replace(/[\\/]+$/, "")}\\Poseidon`)}</p>
      </div>
      <Checkbox checked={settings.askInstallDir} onChange={(askInstallDir) => void save({ askInstallDir })} label={t.askInstallDir} hint={t.askInstallDirHint} />
      <Checkbox checked={settings.desktopShortcut} onChange={(desktopShortcut) => void save({ desktopShortcut })} label={t.desktopShortcut} hint={t.desktopShortcutHint} />
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const settings = useLauncher((s) => s.settings);
  const catalog = useLauncher((s) => s.catalog);
  const save = useLauncher((s) => s.saveSettings);
  const refreshCatalog = useLauncher((s) => s.refreshCatalog);
  const [url, setUrl] = useState(settings?.catalogUrl ?? "");
  const [reloading, setReloading] = useState(false);

  useEffect(() => setUrl(settings?.catalogUrl ?? ""), [settings?.catalogUrl]);

  if (!settings) return null;
  return (
    <div className="grid max-w-3xl gap-6">
      <GlassCard
        title={
          <span className="flex items-center gap-2">
            <Languages className="size-3.5" /> {t.settings.language}
          </span>
        }
      >
        <LanguagePicker />
      </GlassCard>

      <GlassCard title={t.settings.appearance}>
        <div className="p-4">
          <AppearanceSettings useAppearance={useAppearance} labels={t.appearance} />
        </div>
      </GlassCard>

      <GlassCard title={t.settings.installs}>
        <InstallSettings settings={settings} />
      </GlassCard>

      <GlassCard title={t.settings.behaviour}>
        <div className="grid gap-3 p-4">
          <Checkbox checked={settings.closeToTray} onChange={(closeToTray) => void save({ closeToTray })} label={t.settings.closeToTray} hint={t.settings.closeToTrayHint} />
          <Checkbox checked={settings.autoCheck} onChange={(autoCheck) => void save({ autoCheck })} label={t.settings.autoCheck} hint={t.settings.autoCheckHint} />
          <Checkbox checked={settings.notify} onChange={(notify) => void save({ notify })} label={t.settings.notify} hint={t.settings.notifyHint} />
        </div>
      </GlassCard>

      <GlassCard
        title={t.settings.catalog}
        actions={
          <button
            type="button"
            className="btn"
            disabled={reloading}
            onClick={async () => {
              setReloading(true);
              await refreshCatalog();
              setReloading(false);
            }}
          >
            {reloading ? t.settings.reloading : t.settings.reload}
          </button>
        }
      >
        <div className="grid gap-3 p-4">
          {catalog && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
              <PillBadge tone={catalog.source === "custom" ? "amber" : "neutral"}>{t.settings.sources[catalog.source]}</PillBadge>
              <span>
                {t.settings.catalogStats(
                  catalog.catalog.revision,
                  catalog.catalog.apps.filter((a) => a.status !== "slot").length,
                  catalog.catalog.apps.filter((a) => a.status === "slot").length,
                )}
              </span>
            </div>
          )}
          {catalog?.error && <p className="rounded-md bg-amber/10 px-2.5 py-2 text-[12px] text-amber select-text">{t.settings.refreshFailed(catalog.error)}</p>}
          <div>
            <FieldLabel>{t.settings.customCatalog}</FieldLabel>
            <div className="flex gap-2">
              <TextField mono className="flex-1" value={url} placeholder={t.settings.customPlaceholder} onChange={(e) => setUrl(e.target.value)} />
              <button type="button" className="btn" disabled={url === (settings.catalogUrl ?? "")} onClick={() => void save({ catalogUrl: url || null })}>
                {t.settings.save}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">{t.settings.customHint}</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
