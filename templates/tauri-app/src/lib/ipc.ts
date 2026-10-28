import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AbyssContext } from "@abyss/ui";

/** False in a plain browser (`npm run dev`): backend calls are skipped. */
export const inTauri = isTauri();

export interface AppInfo {
  version: string;
  /** Started from the Abyss launcher (which then installs this app's updates). */
  abyss: AbyssContext;
}

export const ipc = {
  appInfo: () => invoke<AppInfo>("app_info"),
};
