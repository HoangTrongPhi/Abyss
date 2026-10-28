/** IPC contracts with the Rust side (`src-tauri/src/commands.rs`, `catalog.rs`, …). */

export type Status = "available" | "beta" | "coming_soon" | "slot";

export interface InstallSpec {
  kind: "nsis";
  uninstallKey: string;
  exe: string;
  pubkey?: string | null;
  manifest?: string | null;
}

export interface CatalogApp {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  accent?: string | null;
  status: Status;
  repo?: string | null;
  homepage?: string | null;
  install?: InstallSpec | null;
}

export interface CatalogAddon {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  status: Status;
  module?: string | null;
  repo?: string | null;
  asset?: string | null;
  url?: string | null;
  minBlender?: string | null;
  homepage?: string | null;
}

export interface Catalog {
  schema: number;
  revision: number;
  apps: CatalogApp[];
  addons: CatalogAddon[];
}

export type CatalogSource = "bundled" | "cache" | "remote" | "custom";

export interface LoadedCatalog {
  catalog: Catalog;
  source: CatalogSource;
  baseUrl: string | null;
  error: string | null;
}

export interface Installed {
  version: string;
  installDir: string;
  exe: string | null;
}

/** Install dialog choices; what is left out comes from the settings. */
export interface InstallOptions {
  root?: string | null;
  desktopShortcut?: boolean;
}

/** Where a new install would go (`install_target`). */
export interface InstallTarget {
  root: string;
  /** `<root>\<product>`. */
  dir: string;
  /** `root` is %LOCALAPPDATA%, the installers' own default. */
  isDefault: boolean;
  writable: boolean;
  /** The app's folder already has files in it. */
  notEmpty: boolean;
  /** Free bytes on that drive. */
  free: number | null;
}

export interface AppStatus {
  id: string;
  installed: Installed | null;
  running: boolean;
}

export interface LatestRelease {
  version: string;
  notes: string | null;
  pubDate: string | null;
  url: string;
}

export interface LatestInfo {
  id: string;
  latest: LatestRelease | null;
  updateAvailable: boolean;
  error: string | null;
}

export type JobPhase = "resolving" | "downloading" | "verifying" | "installing" | "uninstalling" | "done" | "error";

export interface JobEvent {
  /** App id, or the key the UI gave an add-on job. */
  target: string;
  phase: JobPhase;
  downloaded: number;
  total: number | null;
  message: string | null;
}

export interface LocalApp {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export interface Settings {
  closeToTray: boolean;
  autoCheck: boolean;
  /** Windows notification when a check finds a new version. */
  notify: boolean;
  catalogUrl: string | null;
  /** Mirror of the UI language for the backend (tray, job messages); the UI's own copy wins. */
  language: string;
  /** Folder new apps install into, each in `<folder>\<product>`; null: %LOCALAPPDATA%. */
  installRoot: string | null;
  /** Show the install dialog before each new install. */
  askInstallDir: boolean;
  /** Keep the desktop shortcut the installers make. */
  desktopShortcut: boolean;
  localApps: LocalApp[];
}

/** What Settings can change (`save_settings`). */
export type EditableSettings = Pick<Settings, "closeToTray" | "autoCheck" | "notify" | "catalogUrl" | "installRoot" | "askInstallDir" | "desktopShortcut">;

export interface BlenderInstall {
  executable: string;
  version: string;
  series: string;
  supported: boolean;
  userDir: string;
  modules: string[];
}

export interface AddonOutcome {
  executable: string;
  ok: boolean;
  module: string | null;
  error: string | null;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  /** Where apps go when no install folder is chosen (%LOCALAPPDATA%). */
  defaultInstallRoot: string;
}

export interface TrayApp {
  id: string;
  name: string;
  path: string;
  args: string[];
}
