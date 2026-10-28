import { create } from "zustand";

export type Page = "apps" | "updates" | "blender" | "settings";
export type AppFilter = "all" | "installed" | "updates";

export interface Toast {
  id: number;
  tone: "info" | "success" | "error";
  text: string;
}

interface UiState {
  page: Page;
  setPage: (page: Page) => void;
  search: string;
  setSearch: (search: string) => void;
  filter: AppFilter;
  setFilter: (filter: AppFilter) => void;
  /** App whose details dialog is open. */
  detailsId: string | null;
  setDetailsId: (id: string | null) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  page: "apps",
  setPage: (page) => set({ page }),
  search: "",
  setSearch: (search) => set({ search }),
  filter: "all",
  setFilter: (filter) => set({ filter }),
  detailsId: null,
  setDetailsId: (detailsId) => set({ detailsId }),
  toasts: [],
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

let nextToast = 1;

export function toast(tone: Toast["tone"], text: string) {
  const id = nextToast++;
  useUiStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, text }] }));
  setTimeout(() => useUiStore.getState().dismissToast(id), tone === "error" ? 8000 : 4000);
}
