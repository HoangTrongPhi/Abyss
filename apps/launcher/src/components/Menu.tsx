import { cn } from "@abyss/ui";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** "⋯" button with a small dropdown; closes on outside click and Esc. */
export function Menu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className="icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full z-40 mb-1 min-w-48 animate-pop-in rounded-lg border border-edge-strong bg-panel-raised p-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors disabled:opacity-40",
                it.danger ? "text-rose hover:bg-rose/10" : "text-ink hover:bg-tint/6",
              )}
            >
              <span className="grid size-4 place-items-center text-ink-faint [&>svg]:size-3.5">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
