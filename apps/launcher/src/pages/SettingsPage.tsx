import { AppearanceSettings, Checkbox, FieldLabel, GlassCard, PathText, PillBadge, TextField } from "@abyss/ui";
import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { CatalogSource } from "../lib/types";
import { useAppearance } from "../stores/appearance";
import { useLauncher } from "../stores/launcherStore";

const SOURCES: Record<CatalogSource, string> = {
  bundled: "Built into this version of Abyss",
  cache: "Last downloaded copy",
  remote: "Downloaded from GitHub",
  custom: "Custom source",
};

export function SettingsPage() {
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
      <GlassCard title="Appearance">
        <div className="p-4">
          <AppearanceSettings useAppearance={useAppearance} />
        </div>
      </GlassCard>

      <GlassCard title="Behaviour">
        <div className="grid gap-3 p-4">
          <Checkbox
            checked={settings.closeToTray}
            onChange={(closeToTray) => void save({ closeToTray })}
            label="Keep running in the tray when the window is closed"
            hint="Queued updates still install when their app closes. Quit from the tray icon."
          />
          <Checkbox
            checked={settings.autoCheck}
            onChange={(autoCheck) => void save({ autoCheck })}
            label="Check for app updates automatically"
            hint="At start and every 6 hours. Nothing installs without your click."
          />
        </div>
      </GlassCard>

      <GlassCard
        title="Catalog"
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
            {reloading ? "Reloading…" : "Reload"}
          </button>
        }
      >
        <div className="grid gap-3 p-4">
          {catalog && (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
              <PillBadge tone={catalog.source === "custom" ? "amber" : "neutral"}>{SOURCES[catalog.source]}</PillBadge>
              <span>
                revision {catalog.catalog.revision} · {catalog.catalog.apps.filter((a) => a.status !== "slot").length} apps ·{" "}
                {catalog.catalog.apps.filter((a) => a.status === "slot").length} free slots
              </span>
            </div>
          )}
          {catalog?.error && <p className="rounded-md bg-amber/10 px-2.5 py-2 text-[12px] text-amber select-text">Could not refresh: {catalog.error}</p>}
          <div>
            <FieldLabel>Custom catalog (URL or catalog.json path)</FieldLabel>
            <div className="flex gap-2">
              <TextField mono className="flex-1" value={url} placeholder="Empty: the GitHub catalog" onChange={(e) => setUrl(e.target.value)} />
              <button type="button" className="btn" disabled={url === (settings.catalogUrl ?? "")} onClick={() => void save({ catalogUrl: url || null })}>
                Save
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">For testing a new app before it is published. The ABYSS_CATALOG environment variable wins over this.</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard title="About">
        <div className="grid gap-2 p-4 text-[12.5px] text-ink-muted">
          <div>
            Abyss v{info?.version} · © 2026 Hoàng Trọng Phi
          </div>
          {info && (
            <div className="flex items-center gap-2">
              <PathText path={info.dataDir} className="min-w-0 flex-1 text-ink-faint" />
              <button type="button" className="btn" onClick={() => void ipc.revealPath(info.dataDir).catch(() => {})}>
                <FolderOpen className="size-3.5" /> Data folder
              </button>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
