/**
 * App icons: the catalog's own icons are bundled into the launcher (so they show offline);
 * other relative paths resolve against the catalog's web folder; https URLs are used as they are.
 */
const bundled = import.meta.glob("../../../../catalog/icons/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const byName = new Map(Object.entries(bundled).map(([path, url]) => [path.split("/").pop()!.toLowerCase(), url]));

export function iconUrl(icon: string | null | undefined, baseUrl: string | null): string | null {
  if (!icon) return null;
  if (/^https:\/\//.test(icon)) return icon;
  const local = byName.get(icon.split("/").pop()!.toLowerCase());
  if (local) return local;
  return baseUrl ? baseUrl + icon.replace(/^\.?\//, "") : null;
}

/** Stable hue for apps without an icon (local apps), from their name. */
export function monogramColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
