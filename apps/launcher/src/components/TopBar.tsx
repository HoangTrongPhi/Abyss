import { PillBadge } from "@abyss/ui";
import { RefreshCw, Search } from "lucide-react";
import { useLauncher } from "../stores/launcherStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";
import { useUiStore, type Page } from "../stores/uiStore";

const TITLES: Record<Page, { title: string; description: string }> = {
  apps: { title: "Apps", description: "Install, open and keep every app of the suite up to date" },
  updates: { title: "Updates", description: "New versions of your apps and of Abyss" },
  blender: { title: "Blender add-ons", description: "Install add-ons into every Blender on this PC at once" },
  settings: { title: "Settings", description: "Appearance, behaviour and where the catalog comes from" },
};

export function TopBar() {
  const page = useUiStore((s) => s.page);
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);
  const setPage = useUiStore((s) => s.setPage);
  const checking = useLauncher((s) => s.checking);
  const checkUpdates = useLauncher((s) => s.checkUpdates);
  const version = useLauncher((s) => s.info?.version);
  const selfAvailable = useSelfUpdate((s) => s.available);
  const t = TITLES[page];

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-edge bg-panel/70 px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-[15px] font-semibold whitespace-nowrap text-ink">{t.title}</h1>
        <span className="hidden truncate text-[12px] text-ink-faint xl:inline">{t.description}</span>
      </div>
      <div className="flex-1" />
      {page === "apps" && (
        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-edge bg-canvas/70 px-3 text-[12px] text-ink-faint focus-within:border-accent/60">
          <Search className="size-3.5 shrink-0" />
          <input
            id="app-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd>Ctrl F</kbd>
        </label>
      )}
      <button type="button" className="btn" disabled={checking} onClick={() => void checkUpdates()}>
        <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} />
        {checking ? "Checking…" : "Check for updates"}
      </button>
      {selfAvailable ? (
        <button type="button" onClick={() => setPage("updates")}>
          <PillBadge tone="accent">Abyss v{selfAvailable.version} ready</PillBadge>
        </button>
      ) : (
        version && <PillBadge>Abyss v{version}</PillBadge>
      )}
    </header>
  );
}
