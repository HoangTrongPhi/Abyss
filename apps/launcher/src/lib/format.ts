import { tr } from "../i18n";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(tr().locale, { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(tr().locale, { hour: "2-digit", minute: "2-digit" });
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
