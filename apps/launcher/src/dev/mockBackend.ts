/**
 * Dev-only fake backend so the UI can be exercised in a plain browser: open
 * `http://localhost:1430/?mock`. Never active in production builds or inside Tauri.
 * Must not import `lib/ipc` (it reads `isTauri()` once, before this file sets it).
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import realCatalog from "../../../../catalog/catalog.json";
import type { AppStatus, BlenderInstall, Catalog, JobEvent, LatestInfo, LoadedCatalog, LocalApp, Settings } from "../lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The real catalog plus a sample "coming soon" app and add-on, so every card state shows. */
const catalog: Catalog = {
  ...(realCatalog as unknown as Catalog),
  apps: [
    ...(realCatalog as unknown as Catalog).apps.filter((a) => a.status !== "slot"),
    { id: "sample-next", name: "Sample Next", tagline: "Mock data: an app that is not released yet", category: "Sample", accent: "#10b981", status: "coming_soon" },
    ...(realCatalog as unknown as Catalog).apps.filter((a) => a.status === "slot"),
  ],
  addons: [
    { id: "abyss-hello", name: "Abyss Hello", tagline: "Mock data: the test add-on from samples/", status: "available", module: "abyss_hello", minBlender: "4.2", url: "https://example.invalid/abyss_hello.zip" },
    ...(realCatalog as unknown as Catalog).addons,
  ],
};

let installed: Record<string, string> = { poseidon: "1.0.1" };
let running = new Set<string>();
const localApps: LocalApp[] = [{ id: "local-my-tool", name: "My Tool", path: "D:\\Tools\\MyTool\\MyTool.exe", args: [] }];
let settings: Settings = { closeToTray: true, autoCheck: true, notify: true, catalogUrl: null, language: "en", localApps };
const blender: BlenderInstall[] = [
  { executable: "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe", version: "5.2.2", series: "5.2", supported: true, userDir: "", modules: ["node_wrangler_plus"] },
  { executable: "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe", version: "5.1.0", series: "5.1", supported: true, userDir: "", modules: [] },
  { executable: "C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe", version: "3.6.9", series: "3.6", supported: false, userDir: "", modules: [] },
];

async function job(target: string, phases: JobEvent["phase"][], message: string) {
  const send = (phase: JobEvent["phase"], downloaded = 0, total: number | null = null, msg: string | null = null) =>
    emit("abyss://job", { target, phase, downloaded, total, message: msg } satisfies JobEvent);
  for (const phase of phases) {
    if (phase === "downloading") {
      const total = 18_400_000;
      for (let d = 0; d <= total; d += 2_300_000) {
        await send("downloading", d, total);
        await sleep(160);
      }
    } else {
      await send(phase);
      await sleep(500);
    }
  }
  await send("done", 0, null, message);
}

function states(): AppStatus[] {
  const out: AppStatus[] = catalog.apps
    .filter((a) => a.install)
    .map((a) => ({
      id: a.id,
      installed: installed[a.id] ? { version: installed[a.id], installDir: `C:\\Users\\me\\AppData\\Local\\${a.name}`, exe: `C:\\Users\\me\\AppData\\Local\\${a.name}\\${a.install!.exe}` } : null,
      running: running.has(a.id),
    }));
  for (const l of settings.localApps) out.push({ id: l.id, installed: { version: "", installDir: "D:\\Tools\\MyTool", exe: l.path }, running: running.has(l.id) });
  return out;
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) {
  (globalThis as { isTauri?: boolean }).isTauri = true;
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      switch (cmd) {
        case "app_info":
          return { version: "0.1.0", dataDir: "C:\\Users\\me\\AppData\\Local\\com.phineas.abyss" };
        case "catalog_get":
        case "catalog_refresh":
          return { catalog, source: "bundled", baseUrl: null, error: cmd === "catalog_refresh" ? "https://raw.githubusercontent.com/…/catalog.json: not found (404)" : null } satisfies LoadedCatalog;
        case "app_states":
          return states();
        case "check_updates":
          await sleep(700);
          return [
            {
              id: "poseidon",
              latest: { version: "1.0.2", notes: "Mock data.\n- Faster asset matcher on Google Drive\n- Unity HDRP mask maps", pubDate: "2026-10-20T10:00:00Z", url: "" },
              updateAvailable: installed.poseidon === "1.0.1",
              error: null,
            },
          ] satisfies LatestInfo[];
        case "install_app":
          await job(a.id, ["resolving", "downloading", "verifying", "installing"], `${catalog.apps.find((x) => x.id === a.id)?.name} v1.0.2 installed`);
          installed = { ...installed, [a.id]: "1.0.2" };
          return states().find((s) => s.id === a.id)!.installed;
        case "uninstall_app":
          await job(a.id, ["uninstalling"], `${a.id} uninstalled`);
          delete installed[a.id];
          return null;
        case "launch_app":
          running = new Set([...running, a.id]);
          setTimeout(() => running.delete(a.id), 8000);
          return null;
        case "get_settings":
          return settings;
        case "save_settings":
          settings = { ...settings, closeToTray: a.closeToTray, autoCheck: a.autoCheck, notify: a.notify, catalogUrl: a.catalogUrl };
          return settings;
        case "set_language":
          settings = { ...settings, language: a.language };
          return null;
        case "notify_update":
          console.info("[mock] Windows notification:", a.title, "—", a.body);
          return settings.notify && !document.hasFocus();
        case "add_local_app": {
          const name = String(a.path).split("\\").pop()!.replace(/\.\w+$/, "");
          const app = { id: `local-${name.toLowerCase()}`, name, path: a.path, args: [] };
          settings.localApps.push(app);
          return app;
        }
        case "remove_local_app":
          settings.localApps = settings.localApps.filter((l) => l.id !== a.id);
          return null;
        case "blender_scan":
          await sleep(a.force ? 900 : 200);
          return blender;
        case "addon_install":
          await job(a.key, a.catalogId ? ["resolving", "downloading", "verifying", "installing"] : ["installing"], `Installed in ${a.executables.length} of ${a.executables.length} Blender version(s)`);
          for (const b of blender) if (a.executables.includes(b.executable) && !b.modules.includes("abyss_hello")) b.modules.push("abyss_hello");
          return a.executables.map((executable: string) => ({ executable, ok: true, module: "abyss_hello", error: null }));
        case "addon_remove":
          await job(a.key, ["uninstalling"], "Removed");
          for (const b of blender) b.modules = b.modules.filter((m) => m !== a.module);
          return a.executables.map((executable: string) => ({ executable, ok: true, module: a.module, error: null }));
        case "plugin:dialog|open":
          return "D:\\Tools\\Krita\\krita.exe";
        case "plugin:dialog|ask":
        case "plugin:dialog|message":
          return true;
        case "plugin:updater|check":
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
