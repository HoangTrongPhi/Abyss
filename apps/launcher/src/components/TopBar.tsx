import { PillBadge, resolvedTheme } from "@abyss/ui";
import { Moon, RefreshCw, Search, Sun } from "lucide-react";
import { useT } from "../i18n";
import { appearance, useAppearance } from "../stores/appearance";
import { useLauncher } from "../stores/launcherStore";
import { useSelfUpdate } from "../stores/selfUpdateStore";
import { useUiStore } from "../stores/uiStore";
import { NotificationBell } from "./NotificationBell";

export function TopBar() {
  const t = useT();
  const page = useUiStore((s) => s.page);
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);
  const setPage = useUiStore((s) => s.setPage);
  const checking = useLauncher((s) => s.checking);
  const checkUpdates = useLauncher((s) => s.checkUpdates);
  const version = useLauncher((s) => s.info?.version);
  const selfAvailable = useSelfUpdate((s) => s.available);
  const dark = resolvedTheme(useAppearance((s) => s.theme)) === "dark";
  const title = t.pages[page];

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-panel/70 px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-[15px] font-semibold whitespace-nowrap text-ink">{title.title}</h1>
        <span className="hidden truncate text-[12px] text-ink-faint xl:inline">{title.description}</span>
      </div>
      <div className="flex-1" />
      {page === "apps" && (
        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-edge bg-canvas/70 px-3 text-[12px] text-ink-faint focus-within:border-accent/60">
          <Search className="size-3.5 shrink-0" />
          <input
            id="app-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.topBar.search}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd>Ctrl F</kbd>
        </label>
      )}
      <button type="button" className="btn" disabled={checking} onClick={() => void checkUpdates()}>
        <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} />
        {checking ? t.topBar.checking : t.topBar.check}
      </button>
      <div className="flex items-center gap-0.5">
        <NotificationBell />
        <button
          type="button"
          className="icon-btn size-8"
          aria-label={dark ? t.topBar.toLight : t.topBar.toDark}
          title={dark ? t.topBar.toLight : t.topBar.toDark}
          onClick={appearance.toggleTheme}
        >
          {dark ? <Sun className="size-[17px]" strokeWidth={1.75} /> : <Moon className="size-[17px]" strokeWidth={1.75} />}
        </button>
      </div>
      {selfAvailable ? (
        <button type="button" onClick={() => setPage("updates")}>
          <PillBadge tone="accent">{t.topBar.selfReady(selfAvailable.version)}</PillBadge>
        </button>
      ) : (
        version && <PillBadge>Abyss v{version}</PillBadge>
      )}
    </header>
  );
}
