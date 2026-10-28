import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Appearance preferences shared by every Abyss app: colour theme, UI / code fonts, UI scale and effects.
 * Kept in the webview's localStorage under a per-app key and applied to `<html>` (`data-theme`, `data-fx`,
 * `--font-sans`, `--font-mono`) before the first render, so an app opens in its look without a flash.
 */
export type ThemeMode = "dark" | "light" | "system";

/**
 * Decorative motion (`theme.css`, `.fx-*` classes). `reduced` stops what loops (backgrounds stay still),
 * `off` also drops entrance animations, hover lights and backdrops. Progress bars and spinners always run.
 */
export type EffectsLevel = "full" | "reduced" | "off";

export const EFFECTS_LEVELS: EffectsLevel[] = ["full", "reduced", "off"];

export interface FontOption {
  id: string;
  label: string;
  stack: string;
}

/** Inter, Be Vietnam Pro and JetBrains Mono are bundled (full Vietnamese); the rest ship with Windows. */
export const UI_FONTS: FontOption[] = [
  { id: "segoe", label: "Segoe UI (Windows)", stack: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  { id: "inter", label: "Inter", stack: '"Inter Variable", "Segoe UI", system-ui, sans-serif' },
  { id: "be-vietnam", label: "Be Vietnam Pro", stack: '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif' },
  { id: "bahnschrift", label: "Bahnschrift", stack: 'Bahnschrift, "Segoe UI", system-ui, sans-serif' },
  { id: "tahoma", label: "Tahoma", stack: 'Tahoma, "Segoe UI", system-ui, sans-serif' },
];

export const MONO_FONTS: FontOption[] = [
  { id: "cascadia", label: "Cascadia Mono (Windows)", stack: '"Cascadia Mono", "Cascadia Code", Consolas, monospace' },
  { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono Variable", Consolas, monospace' },
  { id: "consolas", label: "Consolas", stack: "Consolas, monospace" },
];

export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const;

export interface AppearanceState {
  theme: ThemeMode;
  uiFont: string;
  monoFont: string;
  uiScale: number;
  effects: EffectsLevel;
  setTheme: (theme: ThemeMode) => void;
  setUiFont: (id: string) => void;
  setMonoFont: (id: string) => void;
  setUiScale: (scale: number) => void;
  setEffects: (effects: EffectsLevel) => void;
  reset: () => void;
}

const DEFAULTS = { theme: "dark" as ThemeMode, uiFont: "segoe", monoFont: "cascadia", uiScale: 1, effects: "full" as EffectsLevel };

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** The theme actually shown: `system` follows Windows' app mode. */
export function resolvedTheme(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? (systemDark.matches ? "dark" : "light") : mode;
}

function apply(s: Pick<AppearanceState, "theme" | "uiFont" | "monoFont" | "uiScale" | "effects">) {
  const root = document.documentElement;
  const theme = resolvedTheme(s.theme);
  root.dataset.theme = theme;
  root.dataset.fx = s.effects;
  root.style.colorScheme = theme;
  root.style.setProperty("--font-sans", (UI_FONTS.find((f) => f.id === s.uiFont) ?? UI_FONTS[0]).stack);
  root.style.setProperty("--font-mono", (MONO_FONTS.find((f) => f.id === s.monoFont) ?? MONO_FONTS[0]).stack);
  if (isTauri()) {
    // Title bar follows the theme (null = follow Windows); zoom scales the whole UI like Ctrl +/-.
    getCurrentWindow().setTheme(s.theme === "system" ? null : theme).catch(() => {});
    getCurrentWebview().setZoom(s.uiScale).catch(() => {});
  }
}

/**
 * One appearance store per app (`storageKey` e.g. "abyss.appearance"). Call `init()` before the
 * first render; it applies the saved look now and whenever it or the Windows theme changes.
 * Needs the `core:window:allow-set-theme` and `core:webview:allow-set-webview-zoom` permissions.
 */
export function createAppearance(storageKey: string) {
  const useAppearance = create<AppearanceState>()(
    persist(
      (set) => ({
        ...DEFAULTS,
        setTheme: (theme) => set({ theme }),
        setUiFont: (uiFont) => set({ uiFont }),
        setMonoFont: (monoFont) => set({ monoFont }),
        setUiScale: (uiScale) => set({ uiScale }),
        setEffects: (effects) => set({ effects }),
        reset: () => set(DEFAULTS),
      }),
      { name: storageKey, version: 1 },
    ),
  );

  function init() {
    apply(useAppearance.getState());
    useAppearance.subscribe(apply);
    systemDark.addEventListener("change", () => useAppearance.getState().theme === "system" && apply(useAppearance.getState()));
    // Looping effects pause while the window is hidden (in the tray, minimized).
    const onVisibility = () => document.documentElement.toggleAttribute("data-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
  }

  /** Flip between light and dark (leaves `system`). */
  function toggleTheme() {
    const { theme, setTheme } = useAppearance.getState();
    setTheme(resolvedTheme(theme) === "dark" ? "light" : "dark");
  }

  return { useAppearance, init, toggleTheme };
}
