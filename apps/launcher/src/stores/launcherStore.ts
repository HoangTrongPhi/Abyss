import { create } from "zustand";
import { inTauri, ipc, onJob, onTray } from "../lib/ipc";
import type { AppInfo, AppStatus, CatalogApp, JobEvent, LatestInfo, LoadedCatalog, LocalApp, Settings, TrayApp } from "../lib/types";
import { toast } from "./uiStore";

/** Installed / running state is polled this often (cheap: registry + process list). */
const POLL_MS = 3000;
/** Background update checks while Abyss runs (Settings → Check for updates automatically). */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** A finished job stays on its card this long. */
const DONE_LINGER_MS = 3500;

interface LauncherState {
  ready: boolean;
  info: AppInfo | null;
  catalog: LoadedCatalog | null;
  settings: Settings | null;
  states: Record<string, AppStatus>;
  latest: Record<string, LatestInfo>;
  /** Latest progress per job target (app id or add-on key). */
  jobs: Record<string, JobEvent>;
  checking: boolean;
  lastChecked: number | null;
  /** Apps whose update installs as soon as they are closed. */
  queued: string[];

  init: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  pollStates: () => Promise<void>;
  checkUpdates: (opts?: { silent?: boolean }) => Promise<void>;
  install: (id: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  launch: (id: string) => Promise<void>;
  toggleQueued: (id: string) => void;
  updateAll: () => Promise<void>;
  addLocalApp: (path: string) => Promise<void>;
  removeLocalApp: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<Pick<Settings, "closeToTray" | "autoCheck" | "catalogUrl">>) => Promise<void>;
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
let started = false;

export const useLauncher = create<LauncherState>()((set, get) => ({
  ready: false,
  info: null,
  catalog: null,
  settings: null,
  states: {},
  latest: {},
  jobs: {},
  checking: false,
  lastChecked: null,
  queued: [],

  async init() {
    // Once per page (StrictMode runs effects twice; a second listener would double every toast).
    if (!inTauri || started) return;
    started = true;
    const [info, catalog, settings] = await Promise.all([ipc.appInfo(), ipc.catalogGet(), ipc.getSettings()]);
    set({ info, catalog, settings, ready: true });
    await onJob((e) => {
      set((s) => ({ jobs: { ...s.jobs, [e.target]: e } }));
      if (e.phase === "done" || e.phase === "error") {
        if (e.message) toast(e.phase === "done" ? "success" : "error", e.message);
        setTimeout(() => set((s) => (s.jobs[e.target] === e ? { jobs: omit(s.jobs, e.target) } : s)), DONE_LINGER_MS);
      }
    });
    await onTray((payload) => (payload === "check" ? void get().checkUpdates() : toast("error", payload)));
    await get().pollStates();
    setInterval(() => void get().pollStates(), POLL_MS);
    void get()
      .refreshCatalog()
      .then(() => {
        if (get().settings?.autoCheck) void get().checkUpdates({ silent: true });
      });
    setInterval(() => get().settings?.autoCheck && void get().checkUpdates({ silent: true }), CHECK_EVERY_MS);
  },

  async refreshCatalog() {
    try {
      set({ catalog: await ipc.catalogRefresh() });
    } catch (e) {
      toast("error", `Catalog: ${err(e)}`);
    }
  },

  async pollStates() {
    let list: AppStatus[];
    try {
      list = await ipc.appStates();
    } catch {
      return;
    }
    const states = Object.fromEntries(list.map((s) => [s.id, s]));
    set({ states });
    syncTray();
    // Queued updates go in once their app is closed.
    for (const id of get().queued) {
      if (!states[id]?.running && !get().jobs[id]) {
        set((s) => ({ queued: s.queued.filter((q) => q !== id) }));
        void get().install(id);
      }
    }
  },

  async checkUpdates({ silent = false } = {}) {
    if (get().checking) return;
    set({ checking: true });
    try {
      const list = await ipc.checkUpdates();
      set({ latest: Object.fromEntries(list.map((l) => [l.id, l])), lastChecked: Date.now() });
      const n = list.filter((l) => l.updateAvailable).length;
      if (!silent) toast("info", n ? `${n} update${n > 1 ? "s" : ""} available` : "Every app is up to date");
    } catch (e) {
      if (!silent) toast("error", `Update check failed: ${err(e)}`);
    } finally {
      set({ checking: false });
    }
  },

  async install(id) {
    try {
      const installed = await ipc.installApp(id);
      set((s) => ({
        latest: s.latest[id] ? { ...s.latest, [id]: { ...s.latest[id], updateAvailable: false } } : s.latest,
        states: { ...s.states, [id]: { id, installed, running: false } },
      }));
    } catch {
      // Reported through the job event (toast + card).
    }
    void get().pollStates();
  },

  async uninstall(id) {
    try {
      await ipc.uninstallApp(id);
    } catch {
      // Reported through the job event.
    }
    void get().pollStates();
  },

  async launch(id) {
    try {
      await ipc.launchApp(id);
      // Show "Running" right away instead of at the next poll.
      setTimeout(() => void get().pollStates(), 800);
    } catch (e) {
      toast("error", err(e));
    }
  },

  toggleQueued(id) {
    set((s) => ({ queued: s.queued.includes(id) ? s.queued.filter((q) => q !== id) : [...s.queued, id] }));
  },

  async updateAll() {
    const { latest, states } = get();
    for (const id of Object.keys(latest).filter((id) => latest[id].updateAvailable)) {
      if (states[id]?.running) {
        if (!get().queued.includes(id)) get().toggleQueued(id);
      } else {
        await get().install(id);
      }
    }
  },

  async addLocalApp(path) {
    try {
      const app: LocalApp = await ipc.addLocalApp(path);
      set((s) => (s.settings ? { settings: { ...s.settings, localApps: [...s.settings.localApps, app] } } : s));
      toast("success", `${app.name} added`);
      void get().pollStates();
    } catch (e) {
      toast("error", err(e));
    }
  },

  async removeLocalApp(id) {
    await ipc.removeLocalApp(id);
    set((s) => (s.settings ? { settings: { ...s.settings, localApps: s.settings.localApps.filter((l) => l.id !== id) } } : s));
    void get().pollStates();
  },

  async saveSettings(patch) {
    const cur = get().settings;
    if (!cur) return;
    const next = { closeToTray: cur.closeToTray, autoCheck: cur.autoCheck, catalogUrl: cur.catalogUrl, ...patch };
    try {
      const settings = await ipc.saveSettings(next);
      set({ settings });
      if (patch.catalogUrl !== undefined) {
        set({ catalog: await ipc.catalogGet() });
        await get().refreshCatalog();
      }
    } catch (e) {
      toast("error", err(e));
    }
  },
}));

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = rec;
  return rest;
}

let lastTray = "";

/** Keep the tray menu's app list equal to what can be launched. */
function syncTray() {
  const { catalog, settings, states } = useLauncher.getState();
  const apps: TrayApp[] = [];
  for (const a of catalog?.catalog.apps ?? []) {
    const exe = states[a.id]?.installed?.exe;
    if (exe) apps.push({ id: a.id, name: a.name, path: exe, args: [] });
  }
  for (const l of settings?.localApps ?? []) if (states[l.id]?.installed) apps.push({ id: l.id, name: l.name, path: l.path, args: l.args });
  const key = JSON.stringify(apps);
  if (key !== lastTray) {
    lastTray = key;
    ipc.setTrayApps(apps).catch(() => {});
  }
}

// --------------------------------------------------------------------------- derived views

export type CardKind = "catalog" | "local";

export interface AppView {
  kind: CardKind;
  id: string;
  name: string;
  app: CatalogApp | null;
  local: LocalApp | null;
  status: AppStatus | null;
  latest: LatestInfo | null;
  job: JobEvent | null;
  queued: boolean;
}

export function useAppViews(): AppView[] {
  const catalog = useLauncher((s) => s.catalog);
  const settings = useLauncher((s) => s.settings);
  const states = useLauncher((s) => s.states);
  const latest = useLauncher((s) => s.latest);
  const jobs = useLauncher((s) => s.jobs);
  const queued = useLauncher((s) => s.queued);
  const views: AppView[] = [];
  for (const a of catalog?.catalog.apps ?? []) {
    if (a.status === "slot") continue;
    views.push({ kind: "catalog", id: a.id, name: a.name, app: a, local: null, status: states[a.id] ?? null, latest: latest[a.id] ?? null, job: jobs[a.id] ?? null, queued: queued.includes(a.id) });
  }
  for (const l of settings?.localApps ?? []) {
    views.push({ kind: "local", id: l.id, name: l.name, app: null, local: l, status: states[l.id] ?? null, latest: null, job: null, queued: false });
  }
  return views;
}

/** Free slots left after local apps took theirs; there is always one to add another app. */
export function useFreeSlots(): number {
  const slots = useLauncher((s) => s.catalog?.catalog.apps.filter((a) => a.status === "slot").length ?? 0);
  const locals = useLauncher((s) => s.settings?.localApps.length ?? 0);
  return Math.max(1, slots - locals);
}

export function useUpdateCount(): number {
  return useLauncher((s) => Object.values(s.latest).filter((l) => l.updateAvailable).length);
}
