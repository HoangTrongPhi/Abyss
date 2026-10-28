import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { AboutDialog } from "./components/AboutDialog";
import { Ambient } from "./components/Ambient";
import { AppDetails } from "./components/AppDetails";
import { InstallDialog } from "./components/InstallDialog";
import { handleHotkey, Rail } from "./components/Rail";
import { LOCAL_APP_EXTENSIONS } from "./components/SlotCard";
import { Toasts } from "./components/Toasts";
import { TopBar } from "./components/TopBar";
import { tr } from "./i18n";
import { inTauri } from "./lib/ipc";
import { AppsPage } from "./pages/AppsPage";
import { BlenderPage, ZIP_JOB } from "./pages/BlenderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UpdatesPage } from "./pages/UpdatesPage";
import { useBlender } from "./stores/blenderStore";
import { useLauncher } from "./stores/launcherStore";
import { scheduleSelfUpdateCheck } from "./stores/selfUpdateStore";
import { toast, useUiStore } from "./stores/uiStore";

const PROGRAM_EXT = new Set(LOCAL_APP_EXTENSIONS);
const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

/** Dropped files: add-on zips install into Blender, programs become local apps. */
function onDrop(paths: string[]) {
  for (const p of paths) {
    if (ext(p) === "zip") {
      useUiStore.getState().setPage("blender");
      void useBlender.getState().install(ZIP_JOB, { zipPath: p });
    } else if (PROGRAM_EXT.has(ext(p))) {
      useUiStore.getState().setPage("apps");
      void useLauncher.getState().addLocalApp(p);
    } else {
      toast("error", tr().drop.unsupported(p.split(/[\\/]/).pop() ?? p));
    }
  }
}

export default function App() {
  const page = useUiStore((s) => s.page);
  const ready = useLauncher((s) => s.ready);

  useEffect(() => {
    void useLauncher.getState().init();
    scheduleSelfUpdateCheck(import.meta.env.DEV);
    const onKey = (e: KeyboardEvent) => handleHotkey(e) && e.preventDefault();
    window.addEventListener("keydown", onKey);
    const unlisten = inTauri
      ? getCurrentWebview().onDragDropEvent((e) => e.payload.type === "drop" && onDrop(e.payload.paths))
      : Promise.resolve(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      void unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full">
      <Rail />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Ambient />
        <TopBar />
        <main className="relative min-h-0 flex-1 overflow-auto px-6 py-6">
          {!inTauri ? (
            <div className="grid h-full place-items-center text-center text-[13px] text-ink-muted">
              <div>
                Abyss needs its desktop backend. Run <code className="font-mono text-ink">npm run tauri dev</code>, or open{" "}
                <a className="text-accent underline" href="?mock">
                  ?mock
                </a>{" "}
                for sample data.
              </div>
            </div>
          ) : !ready ? null : (
            // Keyed by page: each page slides in when it opens.
            <div key={page} className="fx-enter animate-page-in">
              {page === "apps" ? <AppsPage /> : page === "updates" ? <UpdatesPage /> : page === "blender" ? <BlenderPage /> : <SettingsPage />}
            </div>
          )}
        </main>
      </div>
      <AppDetails />
      <InstallDialog />
      <AboutDialog />
      <Toasts />
    </div>
  );
}
