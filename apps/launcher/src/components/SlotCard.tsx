import { Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useLauncher } from "../stores/launcherStore";

export const LOCAL_APP_FILTERS = [{ name: "Programs", extensions: ["exe", "bat", "cmd", "lnk", "py", "pyw"] }];

export async function pickLocalApp() {
  const path = await open({ title: "Add an app to Abyss", multiple: false, filters: LOCAL_APP_FILTERS });
  if (typeof path === "string") await useLauncher.getState().addLocalApp(path);
}

/** A free place in the grid: reserved for a future suite app, or for one of the user's own programs. */
export function SlotCard({ index }: { index: number }) {
  return (
    <button
      type="button"
      onClick={() => void pickLocalApp()}
      className="group flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge-strong bg-transparent p-4 text-center transition-colors hover:border-accent/60 hover:bg-accent/5"
    >
      <span className="grid size-11 place-items-center rounded-xl border border-dashed border-edge-strong text-ink-faint transition-colors group-hover:border-accent/60 group-hover:text-accent">
        <Plus className="size-5" />
      </span>
      <span className="text-[13px] font-medium text-ink-muted group-hover:text-ink">Free slot {index}</span>
      <span className="max-w-[220px] text-[11.5px] text-ink-faint">Add your own program, script or shortcut — or drop an .exe on the window</span>
    </button>
  );
}
