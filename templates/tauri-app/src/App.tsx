import { AppearanceSettings, GlassCard, Modal, PillBadge, RailButton } from "@abyss/ui";
import { Home, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { inTauri, ipc, type AppInfo } from "./lib/ipc";
import { useAppearance } from "./stores/appearance";
import { startupUpdateCheck, useUpdateStore } from "./stores/updateStore";

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const update = useUpdateStore();

  useEffect(() => {
    if (inTauri) void ipc.appInfo().then(setInfo);
    void startupUpdateCheck();
  }, []);

  return (
    <div className="flex h-full">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-3">
        <img src="/app-icon.svg" alt="__APP_NAME__" className="mb-3 size-8" draggable={false} />
        <RailButton label="Home" active onClick={() => {}}>
          <Home className="size-[18px]" strokeWidth={1.75} />
        </RailButton>
        <div className="flex-1" />
        <RailButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="size-[18px]" strokeWidth={1.75} />
        </RailButton>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-edge bg-panel/70 px-4">
          <h1 className="text-[14px] font-semibold text-ink">__APP_NAME__</h1>
          <span className="text-[12px] text-ink-faint">__TAGLINE__</span>
          <div className="flex-1" />
          {update.phase === "available" && (
            <button type="button" className="btn btn-primary" onClick={() => void update.installAndRestart()}>
              Update to v{update.available?.version}
            </button>
          )}
          {info && <PillBadge>v{info.version}</PillBadge>}
          {info?.abyss.managed && <PillBadge tone="accent">via Abyss</PillBadge>}
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-6">
          <GlassCard title="Start here" className="max-w-2xl">
            <div className="grid gap-2 p-4 text-[12.5px] text-ink-muted">
              <p>
                <b className="text-ink">__APP_NAME__</b> is wired to the suite: the Studio Dark theme and components from{" "}
                <code className="font-mono text-ink">@abyss/ui</code>, signed self-updates, and an entry in the Abyss catalog.
              </p>
              <p>
                Build the UI in <code className="font-mono text-ink">src/</code> and the Rust backend in{" "}
                <code className="font-mono text-ink">src-tauri/src/</code>. Release with <code className="font-mono text-ink">npm run release -- -Version 0.1.0</code>.
              </p>
            </div>
          </GlassCard>
        </main>
      </div>

      <Modal open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <AppearanceSettings useAppearance={useAppearance} />
      </Modal>
    </div>
  );
}
