import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AddonOutcome,
  AppInfo,
  AppStatus,
  BlenderInstall,
  Installed,
  JobEvent,
  LatestInfo,
  LoadedCatalog,
  LocalApp,
  Settings,
  TrayApp,
} from "./types";

/** False in a plain browser (`npm run dev` without `?mock`): backend calls are skipped. */
export const inTauri = isTauri();

export const ipc = {
  appInfo: () => invoke<AppInfo>("app_info"),
  catalogGet: () => invoke<LoadedCatalog>("catalog_get"),
  catalogRefresh: () => invoke<LoadedCatalog>("catalog_refresh"),
  appStates: () => invoke<AppStatus[]>("app_states"),
  checkUpdates: () => invoke<LatestInfo[]>("check_updates"),
  installApp: (id: string) => invoke<Installed>("install_app", { id }),
  uninstallApp: (id: string) => invoke<void>("uninstall_app", { id }),
  launchApp: (id: string) => invoke<void>("launch_app", { id }),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  setTrayApps: (apps: TrayApp[]) => invoke<void>("set_tray_apps", { apps }),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (s: Pick<Settings, "closeToTray" | "autoCheck" | "catalogUrl">) => invoke<Settings>("save_settings", s),
  addLocalApp: (path: string, name?: string) => invoke<LocalApp>("add_local_app", { path, name }),
  removeLocalApp: (id: string) => invoke<void>("remove_local_app", { id }),
  blenderScan: (force: boolean) => invoke<BlenderInstall[]>("blender_scan", { force }),
  addonInstall: (key: string, source: { catalogId?: string; zipPath?: string }, executables: string[]) =>
    invoke<AddonOutcome[]>("addon_install", { key, catalogId: source.catalogId ?? null, zipPath: source.zipPath ?? null, executables }),
  addonRemove: (key: string, module: string, executables: string[]) => invoke<AddonOutcome[]>("addon_remove", { key, module, executables }),
};

export const JOB_EVENT = "abyss://job";
export const TRAY_EVENT = "abyss://tray";

export function onJob(cb: (e: JobEvent) => void): Promise<UnlistenFn> {
  return listen<JobEvent>(JOB_EVENT, (e) => cb(e.payload));
}

export function onTray(cb: (payload: string) => void): Promise<UnlistenFn> {
  return listen<string>(TRAY_EVENT, (e) => cb(e.payload));
}
