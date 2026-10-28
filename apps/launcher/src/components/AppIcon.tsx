import { cn } from "@abyss/ui";
import { useState } from "react";
import { iconUrl, monogramColor } from "../lib/icons";
import { useLauncher } from "../stores/launcherStore";

/** Catalog icon, or a coloured monogram for local apps and icons that fail to load. */
export function AppIcon({ name, icon, className }: { name: string; icon?: string | null; className?: string }) {
  const baseUrl = useLauncher((s) => s.catalog?.baseUrl ?? null);
  const [broken, setBroken] = useState(false);
  const url = broken ? null : iconUrl(icon, baseUrl);
  if (url) return <img src={url} alt="" draggable={false} onError={() => setBroken(true)} className={cn("size-11 shrink-0 rounded-xl", className)} />;
  const letters = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-semibold text-white ring-1 ring-white/10", className)}
      style={{ background: `linear-gradient(135deg, ${monogramColor(name)}, #11141b)` }}
    >
      {letters || "?"}
    </div>
  );
}
