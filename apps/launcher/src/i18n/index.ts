import { create } from "zustand";
import { persist } from "zustand/middleware";
import { inTauri, ipc } from "../lib/ipc";
import { en, type Messages } from "./en";
import { vi } from "./vi";

/**
 * Launcher language (Settings → Language). Kept in localStorage like the appearance, so the
 * first paint is already in the right language, and mirrored to the backend for the tray menu
 * and job messages. First start follows the Windows display language.
 */
export type Lang = "en" | "vi";
export type { Messages };

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "vi", label: "Tiếng Việt" },
];

const DICTS: Record<Lang, Messages> = { en, vi };

const systemLang = (): Lang => (navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en");

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>()(
  persist(
    (set) => ({
      lang: systemLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: "abyss.language", version: 1 },
  ),
);

/** Texts in the current language, for components (re-renders on a language change). */
export function useT(): Messages {
  return DICTS[useLang((s) => s.lang)];
}

/** Texts in the current language, outside React (stores, toasts). */
export function tr(): Messages {
  return DICTS[useLang.getState().lang];
}

function apply(lang: Lang) {
  document.documentElement.lang = lang;
  if (inTauri) ipc.setLanguage(lang).catch(() => {});
}

/** Call before the first render: sets `<html lang>` and tells the backend, now and on every change. */
export function initLanguage() {
  apply(useLang.getState().lang);
  useLang.subscribe((s, prev) => s.lang !== prev.lang && apply(s.lang));
}

/** "5 minutes ago" / "5 phút trước". */
export function timeAgo(at: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(tr().locale, { numeric: "auto" });
  const s = Math.round((at - now) / 1000);
  if (Math.abs(s) < 60) return rtf.format(0, "second");
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}
