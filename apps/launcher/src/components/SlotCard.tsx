import { Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { tr, useT } from "../i18n";
import { useLauncher } from "../stores/launcherStore";

export const LOCAL_APP_EXTENSIONS = ["exe", "bat", "cmd", "lnk", "py", "pyw"];

export async function pickLocalApp() {
  const t = tr().slot;
  const path = await open({ title: t.pickTitle, multiple: false, filters: [{ name: t.programs, extensions: LOCAL_APP_EXTENSIONS }] });
  if (typeof path === "string") await useLauncher.getState().addLocalApp(path);
}

/** A free place in the grid: reserved for a future suite app, or for one of the user's own programs. */
export function SlotCard({ index }: { index: number }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => void pickLocalApp()}
      className="group flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge-strong bg-transparent p-4 text-center transition-colors hover:border-accent/60 hover:bg-accent/5"
    >
      <span className="grid size-11 place-items-center rounded-xl border border-dashed border-edge-strong text-ink-faint transition-colors group-hover:border-accent/60 group-hover:text-accent">
        <Plus className="size-5" />
      </span>
      <span className="text-[13px] font-medium text-ink-muted group-hover:text-ink">{t.slot.title(index)}</span>
      <span className="max-w-[220px] text-[11.5px] text-ink-faint">{t.slot.hint}</span>
    </button>
  );
}
