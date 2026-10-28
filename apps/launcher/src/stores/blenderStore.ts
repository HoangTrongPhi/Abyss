import { create } from "zustand";
import { ipc } from "../lib/ipc";
import type { AddonOutcome, BlenderInstall } from "../lib/types";
import { toast } from "./uiStore";

interface BlenderState {
  installs: BlenderInstall[];
  scanned: boolean;
  scanning: boolean;
  /** Executables the next install / remove goes to (default: every supported Blender). */
  targets: string[];
  scan: (force?: boolean) => Promise<void>;
  toggleTarget: (exe: string) => void;
  install: (key: string, source: { catalogId?: string; zipPath?: string }) => Promise<void>;
  remove: (key: string, module: string) => Promise<void>;
}

function report(outcomes: AddonOutcome[], installs: BlenderInstall[]) {
  for (const o of outcomes.filter((o) => !o.ok)) {
    const b = installs.find((i) => i.executable === o.executable);
    toast("error", `Blender ${b?.version ?? o.executable}: ${o.error ?? "failed"}`);
  }
}

export const useBlender = create<BlenderState>()((set, get) => ({
  installs: [],
  scanned: false,
  scanning: false,
  targets: [],

  async scan(force = false) {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      const installs = await ipc.blenderScan(force);
      const known = new Set(installs.map((i) => i.executable));
      const kept = get().targets.filter((t) => known.has(t));
      set({ installs, scanned: true, targets: kept.length ? kept : installs.filter((i) => i.supported).map((i) => i.executable) });
    } catch (e) {
      toast("error", `Blender scan failed: ${e}`);
    } finally {
      set({ scanning: false });
    }
  },

  toggleTarget(exe) {
    set((s) => ({ targets: s.targets.includes(exe) ? s.targets.filter((t) => t !== exe) : [...s.targets, exe] }));
  },

  async install(key, source) {
    const targets = get().targets;
    if (!targets.length) return toast("error", "Pick at least one Blender version");
    try {
      report(await ipc.addonInstall(key, source, targets), get().installs);
    } catch {
      // Reported through the job event.
    }
    await get().scan();
  },

  async remove(key, module) {
    const targets = get().installs.filter((i) => get().targets.includes(i.executable) && i.modules.includes(module)).map((i) => i.executable);
    if (!targets.length) return;
    try {
      report(await ipc.addonRemove(key, module, targets), get().installs);
    } catch {
      // Reported through the job event.
    }
    await get().scan();
  },
}));
