import { AppearanceSettings, Checkbox, FieldLabel, GlassCard, PathText, PillBadge, TextField, cn } from "@abyss/ui";
import { FolderOpen, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { LANGS, useLang, useT } from "../i18n";
import { ipc } from "../lib/ipc";
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

export function SettingsPage() {
  const t = useT();
  const settings = useLauncher((s) => s.settings);
  const catalog = useLauncher((s) => s.catalog);
  const info = useLauncher((s) => s.info);
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

      <GlassCard title={t.settings.about}>
        <div className="grid gap-2 p-4 text-[12.5px] text-ink-muted">
          <div>
            Abyss v{info?.version} · © 2026 Hoàng Trọng Phi
          </div>
          {info && (
            <div className="flex items-center gap-2">
              <PathText path={info.dataDir} className="min-w-0 flex-1 text-ink-faint" />
              <button type="button" className="btn" onClick={() => void ipc.revealPath(info.dataDir).catch(() => {})}>
                <FolderOpen className="size-3.5" /> {t.settings.dataFolder}
              </button>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
