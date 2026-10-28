import { Checkbox, EmptyState, GlassCard, PathText, PillBadge, cn } from "@abyss/ui";
import { open } from "@tauri-apps/plugin-dialog";
import { Blocks, FileArchive, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { JobProgress, jobBusy } from "../components/JobProgress";
import type { CatalogAddon } from "../lib/types";
import { useBlender } from "../stores/blenderStore";
import { useLauncher } from "../stores/launcherStore";

export const ZIP_JOB = "addon:zip";

export async function pickAddonZip() {
  const path = await open({ title: "Install a Blender add-on", multiple: false, filters: [{ name: "Blender add-on", extensions: ["zip"] }] });
  if (typeof path === "string") await useBlender.getState().install(ZIP_JOB, { zipPath: path });
}

const meetsMin = (series: string, min?: string | null) => {
  if (!min) return true;
  const [a, b] = series.split(".").map(Number);
  const [x, y] = min.split(".").map(Number);
  return a > x || (a === x && b >= y);
};

function AddonCard({ addon }: { addon: CatalogAddon }) {
  const installs = useBlender((s) => s.installs);
  const targets = useBlender((s) => s.targets);
  const install = useBlender((s) => s.install);
  const remove = useBlender((s) => s.remove);
  const key = `addon:${addon.id}`;
  const job = useLauncher((s) => s.jobs[key] ?? s.jobs[`addon-rm:${addon.module}`]);
  const supported = installs.filter((b) => b.supported && meetsMin(b.series, addon.minBlender));
  const installedIn = supported.filter((b) => addon.module && b.modules.includes(addon.module));
  const installedInTargets = installedIn.some((b) => targets.includes(b.executable));
  const comingSoon = addon.status === "coming_soon";

  return (
    <article className={cn("flex min-h-[150px] flex-col rounded-xl border border-edge bg-panel p-4", comingSoon && "opacity-75")}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber/12 text-amber ring-1 ring-amber/25">
          <Blocks className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-semibold text-ink">{addon.name}</h3>
          <p className="line-clamp-2 text-[12px] text-ink-muted">{addon.tagline}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {supported.map((b) => (
          <PillBadge key={b.executable} tone={installedIn.includes(b) ? "emerald" : "neutral"}>
            {installedIn.includes(b) ? "✓" : "–"} {b.series}
          </PillBadge>
        ))}
        {addon.minBlender && <PillBadge>Blender {addon.minBlender}+</PillBadge>}
      </div>
      <div className="mt-auto pt-3">
        {jobBusy(job) ? (
          <JobProgress job={job!} />
        ) : comingSoon ? (
          <PillBadge>Coming soon</PillBadge>
        ) : (
          <div className="flex justify-end gap-1.5">
            {installedInTargets && (
              <button type="button" className="btn btn-danger" onClick={() => void remove(`addon-rm:${addon.module}`, addon.module!)}>
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={!supported.length} onClick={() => void install(key, { catalogId: addon.id })}>
              {installedIn.length ? "Reinstall" : "Install"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function AddonSlot({ index }: { index: number }) {
  return (
    <button
      type="button"
      onClick={() => void pickAddonZip()}
      className="group flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge-strong p-4 text-center transition-colors hover:border-amber/60 hover:bg-amber/5"
    >
      <span className="grid size-10 place-items-center rounded-lg border border-dashed border-edge-strong text-ink-faint group-hover:border-amber/60 group-hover:text-amber">
        <Plus className="size-5" />
      </span>
      <span className="text-[13px] font-medium text-ink-muted group-hover:text-ink">Add-on slot {index}</span>
      <span className="max-w-[230px] text-[11.5px] text-ink-faint">Reserved for your next add-on. Click to install any add-on .zip now</span>
    </button>
  );
}

export function BlenderPage() {
  const { installs, scanned, scanning, targets, scan, toggleTarget } = useBlender();
  const addons = useLauncher((s) => s.catalog?.catalog.addons ?? []);
  const zipJob = useLauncher((s) => s.jobs[ZIP_JOB]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const listed = addons.filter((a) => a.status !== "slot");
  const slots = addons.filter((a) => a.status === "slot").length;

  return (
    <div className="grid max-w-5xl gap-6">
      <GlassCard
        title="Blender on this PC"
        actions={
          <button type="button" className="btn" disabled={scanning} onClick={() => void scan(true)}>
            <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} /> {scanning ? "Looking…" : "Rescan"}
          </button>
        }
      >
        {!scanned && scanning ? (
          <div className="px-4 py-6 text-[12.5px] text-ink-faint">Looking for Blender (registry, Program Files, Steam, PATH)…</div>
        ) : installs.length ? (
          installs.map((b) => (
            <div key={b.executable} className="flex items-center gap-3 border-b border-edge px-4 py-2.5 last:border-b-0">
              <Checkbox checked={targets.includes(b.executable)} disabled={!b.supported} onChange={() => toggleTarget(b.executable)} label={<span className="font-medium">Blender {b.version}</span>} />
              <PathText path={b.executable} className="min-w-0 flex-1 text-ink-faint" />
              <span className="text-[11.5px] text-ink-faint tabular-nums">{b.modules.length} user add-ons</span>
              {!b.supported && <PillBadge tone="amber">Needs 4.2+</PillBadge>}
            </div>
          ))
        ) : (
          <EmptyState icon={<Blocks className="size-4" />} title="No Blender found">
            Install Blender 4.2 or newer, or set the BLENDER_PATH environment variable, then Rescan.
          </EmptyState>
        )}
      </GlassCard>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold tracking-wide text-ink-muted uppercase">Add-ons</h2>
        <div className="flex items-center gap-3">
          {jobBusy(zipJob) && (
            <div className="w-56">
              <JobProgress job={zipJob!} />
            </div>
          )}
          <button type="button" className="btn" disabled={!targets.length || jobBusy(zipJob)} onClick={() => void pickAddonZip()}>
            <FileArchive className="size-3.5" /> Install from .zip…
          </button>
        </div>
      </div>
      <p className="-mt-3 text-[12px] text-ink-faint">
        Installs go into every ticked Blender, enabled and saved in its preferences. Close Blender first: an open Blender writes its own preferences back when it quits.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {listed.map((a) => <AddonCard key={a.id} addon={a} />)}
        {Array.from({ length: Math.max(1, slots) }, (_, i) => <AddonSlot key={i} index={i + 1} />)}
      </div>
    </div>
  );
}
