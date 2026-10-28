import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tr } from "../i18n";
import { inTauri, ipc } from "../lib/ipc";

/**
 * The bell in the top bar: one entry per new version Abyss finds, of a suite app or of Abyss
 * itself. Kept in localStorage so the list survives restarts. Each version is announced once
 * (also after "Clear all"), and a Windows notification goes with it while the window is not in
 * front (Settings → Show a Windows notification).
 */
export interface Notice {
  /** `<app id>@<version>`; the app id is `abyss` for the launcher itself. */
  id: string;
  appId: string;
  name: string;
  version: string;
  notes: string | null;
  /** When Abyss found it (ms since epoch). */
  at: number;
  read: boolean;
}

export type Found = Pick<Notice, "appId" | "name" | "version" | "notes">;

export const SELF_ID = "abyss";
const MAX_ITEMS = 40;
/** Versions announced so far, so a cleared entry does not come back at the next check. */
const MAX_SEEN = 200;

interface NotificationState {
  items: Notice[];
  seen: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Add the versions not announced before (newest first) and return them. */
  announce: (found: Found[]) => Notice[];
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useNotifications = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      seen: [],
      open: false,
      setOpen: (open) => set({ open }),

      announce(found) {
        const { items, seen } = get();
        const at = Date.now();
        const fresh: Notice[] = found
          .map((f) => ({ ...f, id: `${f.appId}@${f.version}`, at, read: false }))
          .filter((n) => !seen.includes(n.id) && !items.some((i) => i.id === n.id));
        if (!fresh.length) return fresh;
        // A newer version of the same app replaces the older, still unread entry.
        const replaced = new Set(fresh.map((n) => n.appId));
        set({
          items: [...fresh, ...items.filter((i) => !(replaced.has(i.appId) && !i.read))].slice(0, MAX_ITEMS),
          seen: [...fresh.map((n) => n.id), ...seen].slice(0, MAX_SEEN),
        });
        return fresh;
      },

      markAllRead: () => set((s) => (s.items.some((i) => !i.read) ? { items: s.items.map((i) => (i.read ? i : { ...i, read: true })) } : s)),
      dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "abyss.notifications",
      version: 1,
      partialize: (s) => ({ items: s.items, seen: s.seen }),
    },
  ),
);

export function useUnreadCount(): number {
  return useNotifications((s) => s.items.filter((i) => !i.read).length);
}

/** Announce what a check found; new versions also get a Windows notification. */
export function announceUpdates(found: Found[]) {
  const fresh = useNotifications.getState().announce(found);
  if (!fresh.length || !inTauri) return;
  const t = tr().notifications;
  const title = fresh.length === 1 ? t.toastOne(fresh[0].name, fresh[0].version) : t.toastMany(fresh.length);
  const body = fresh.length === 1 ? (firstLine(fresh[0].notes) ?? t.toastBody) : fresh.map((n) => `${n.name} v${n.version}`).join(" · ");
  ipc.notifyUpdate(title, body).catch(() => {});
}

function firstLine(notes: string | null): string | null {
  const line = notes
    ?.split(/\r?\n/)
    .map((l) => l.replace(/^[-*#\s]+/, "").trim())
    .find(Boolean);
  return line ? (line.length > 120 ? `${line.slice(0, 117)}…` : line) : null;
}
