import { RailButton } from "@abyss/ui";
import { Blocks, LayoutGrid, RefreshCcw, Settings2, UserRound } from "lucide-react";
import { useT } from "../i18n";
import { useUpdateCount } from "../stores/launcherStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";
import { useUiStore, type Page } from "../stores/uiStore";

const PAGES: { id: Page; icon: typeof LayoutGrid; hotkey: string }[] = [
  { id: "apps", icon: LayoutGrid, hotkey: "1" },
  { id: "updates", icon: RefreshCcw, hotkey: "2" },
  { id: "blender", icon: Blocks, hotkey: "3" },
];

export function Rail() {
  const t = useT();
  const page = useUiStore((s) => s.page);
  const setPage = useUiStore((s) => s.setPage);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const updates = useUpdateCount();
  const selfUpdate = useSelfUpdate((s) => s.phase === "available");

  return (
    <nav className="relative z-10 flex w-14 shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-3">
      <img src="/abyss-icon.svg" alt="Abyss" className="mb-3 size-8 transition-transform duration-500 hover:rotate-[-8deg] hover:scale-110" draggable={false} />
      {PAGES.map((p) => (
        <RailButton
          key={p.id}
          label={t.pages[p.id].title}
          shortcut={`Ctrl+${p.hotkey}`}
          active={page === p.id}
          badge={p.id === "updates" ? updates + (selfUpdate ? 1 : 0) : undefined}
          onClick={() => setPage(p.id)}
        >
          <p.icon className="size-[18px]" strokeWidth={1.75} />
        </RailButton>
      ))}
      <div className="flex-1" />
      <RailButton label={t.pages.settings.title} shortcut="Ctrl+," active={page === "settings"} onClick={() => setPage("settings")}>
        <Settings2 className="size-[18px]" strokeWidth={1.75} />
      </RailButton>
      <RailButton label={t.about.open} onClick={() => setAboutOpen(true)}>
        <UserRound className="size-[18px]" strokeWidth={1.75} />
      </RailButton>
    </nav>
  );
}

/** Ctrl+1…3 switch pages, Ctrl+, opens Settings, Ctrl+F focuses the app search. */
export function handleHotkey(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || e.altKey || e.shiftKey) return false;
  const { setPage } = useUiStore.getState();
  const p = PAGES.find((p) => p.hotkey === e.key);
  if (p) setPage(p.id);
  else if (e.key === ",") setPage("settings");
  else if (e.key.toLowerCase() === "f") {
    setPage("apps");
    requestAnimationFrame(() => document.getElementById("app-search")?.focus());
  } else return false;
  return true;
}
