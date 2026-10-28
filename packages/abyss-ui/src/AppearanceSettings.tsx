import type { UseBoundStore, StoreApi } from "zustand";
import { MONO_FONTS, UI_FONTS, UI_SCALES, type AppearanceState, type ThemeMode } from "./appearance";
import { FieldLabel, Segmented } from "./Controls";

/** Theme / font / scale controls bound to an app's `createAppearance(...).useAppearance` store. */
export function AppearanceSettings({ useAppearance }: { useAppearance: UseBoundStore<StoreApi<AppearanceState>> }) {
  const s = useAppearance();
  const select = "h-7 w-full rounded-md border border-edge bg-canvas/70 px-2 text-[12px] text-ink outline-none focus:border-accent/60";
  return (
    <div className="grid gap-4">
      <div>
        <FieldLabel>Theme</FieldLabel>
        <Segmented<ThemeMode>
          value={s.theme}
          onChange={s.setTheme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <FieldLabel>Interface font</FieldLabel>
          <select className={select} value={s.uiFont} onChange={(e) => s.setUiFont(e.target.value)}>
            {UI_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel>Code font</FieldLabel>
          <select className={select} value={s.monoFont} onChange={(e) => s.setMonoFont(e.target.value)}>
            {MONO_FONTS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <FieldLabel>Interface size</FieldLabel>
        <Segmented
          value={String(s.uiScale)}
          onChange={(v) => s.setUiScale(Number(v))}
          options={UI_SCALES.map((x) => ({ value: String(x), label: `${Math.round(x * 100)}%` }))}
        />
      </div>
    </div>
  );
}
