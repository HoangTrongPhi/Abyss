/**
 * Talking to the Abyss launcher from an app. Abyss starts apps with `ABYSS=1` and
 * `ABYSS_VERSION=<launcher version>` in their environment; the Rust side reads them with
 * `std::env::var("ABYSS")` and hands the answer to the UI (see templates/tauri-app `app_info`).
 */
export interface AbyssContext {
  /** Started from the Abyss launcher, which also installs this app's updates. */
  managed: boolean;
  launcherVersion: string | null;
}

export const STANDALONE: AbyssContext = { managed: false, launcherVersion: null };

/**
 * Whether an app should run its own update check: always when standalone, never when Abyss
 * manages it (Abyss shows the update and installs it when the app is closed, so the user is
 * not asked twice).
 */
export function shouldSelfUpdate(ctx: AbyssContext) {
  return !ctx.managed;
}
