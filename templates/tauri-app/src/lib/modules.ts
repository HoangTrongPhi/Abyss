import { ChartPie, type LucideIcon } from "lucide-react";
import type { TabId } from "../types/__APP_ID__";

export interface ModuleDef {
  id: TabId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Ctrl+<digit> shortcut. */
  hotkey: string;
  /** What a drop on this module loads (dropRouter / useWindowDragDrop). */
  accepts: "folder" | "files" | "any";
}

/** The app's modules, in navigation order (the rail, Ctrl+1…9, the command palette). */
export const MODULES: ModuleDef[] = [
  { id: "stats", label: "Folder Stats", description: "File count and size by extension", icon: ChartPie, hotkey: "1", accepts: "folder" },
];

export const moduleById = (id: TabId) => MODULES.find((m) => m.id === id) ?? MODULES[0];
