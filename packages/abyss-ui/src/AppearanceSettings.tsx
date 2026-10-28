import type { UseBoundStore, StoreApi } from "zustand";
import { MONO_FONTS, UI_FONTS, UI_SCALES, type AppearanceState, type FontOption, type ThemeMode } from "./appearance";
import { cn } from "./cn";
import { FieldLabel, Segmented } from "./Controls";
import { Monitor, Moon, RotateCcw, Sun } from "./icons";

/** Texts of the appearance controls; apps with a language setting pass their own. */
export interface AppearanceLabels {
  theme: string;
  dark: string;
  light: string;
  system: string;
  uiFont: string;
  monoFont: string;
  scale: string;
  reset: string;
  /** Each interface font is previewed with this text (keep diacritics, to show coverage). */
  sample: string;
}

export const APPEARANCE_LABELS_EN: AppearanceLabels = {
  theme: "Theme",
  dark: "Dark",
  light: "Light",
  system: "System",
  uiFont: "Interface font",
  monoFont: "Code & path font",
  scale: "Interface size",
  reset: "Reset",
  sample: "Abyss — Tiếng Việt có dấu",
};

const THEME_ICONS: Record<ThemeMode, typeof Sun> = { dark: Moon, light: Sun, system: Monitor };

/** One row per font, each previewed in its own face. */
function FontList({ fonts, value, onChange, sample, mono }: { fonts: FontOption[]; value: string; onChange: (id: string) => void; sample: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup">
      {fonts.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={value === f.id}
          onClick={() => onChange(f.id)}
          className={cn(
            "flex items-baseline gap-3 rounded-lg border px-3 py-1.5 text-left transition-colors",
            value === f.id ? "border-accent/60 bg-accent/10" : "border-edge bg-panel-raised/50 hover:border-edge-strong",
          )}
        >
          <span className="w-44 shrink-0 text-[12px] text-ink-muted">{f.label}</span>
          <span className={cn("truncate text-ink", mono ? "text-[12px]" : "text-[13px]")} style={{ fontFamily: f.stack }}>
            {sample}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Theme / font / scale controls bound to an app's `createAppearance(...).useAppearance` store. */
export function AppearanceSettings({ useAppearance, labels = APPEARANCE_LABELS_EN }: { useAppearance: UseBoundStore<StoreApi<AppearanceState>>; labels?: AppearanceLabels }) {
  const s = useAppearance();
  return (
    <div className="grid gap-4">
      <div>
        <FieldLabel>{labels.theme}</FieldLabel>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(["dark", "light", "system"] as const).map((mode) => {
            const Icon = THEME_ICONS[mode];
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={s.theme === mode}
                onClick={() => s.setTheme(mode)}
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded-lg border text-[12.5px] transition-colors",
                  s.theme === mode ? "border-accent/60 bg-accent/10 text-accent" : "border-edge bg-panel-raised/50 text-ink-muted hover:border-edge-strong hover:text-ink",
                )}
              >
                <Icon className="size-4" /> {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <FieldLabel>{labels.uiFont}</FieldLabel>
        <FontList fonts={UI_FONTS} value={s.uiFont} onChange={s.setUiFont} sample={labels.sample} />
      </div>
      <div>
        <FieldLabel>{labels.monoFont}</FieldLabel>
        <FontList fonts={MONO_FONTS} value={s.monoFont} onChange={s.setMonoFont} sample="C:\Apps\Abyss\catalog.json → v1.0.2" mono />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <FieldLabel>{labels.scale}</FieldLabel>
          <Segmented
            value={String(s.uiScale)}
            onChange={(v) => s.setUiScale(Number(v))}
            options={UI_SCALES.map((x) => ({ value: String(x), label: `${Math.round(x * 100)}%` }))}
          />
        </div>
        <button type="button" className="btn" onClick={s.reset}>
          <RotateCcw className="size-3.5" /> {labels.reset}
        </button>
      </div>
    </div>
  );
}
