import type { ReactNode } from "react";
import { cn } from "./cn";

/** Icon button for the left navigation rail, with a hover tooltip and an optional count badge. */
export function RailButton({ active, label, shortcut, badge, onClick, children }: {
  active?: boolean;
  label: string;
  shortcut?: string;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative grid size-10 place-items-center rounded-lg transition-colors",
        active ? "bg-accent/14 text-accent" : "text-ink-faint hover:bg-tint/5 hover:text-ink",
      )}
    >
      {active && <span className="absolute -left-2.5 h-5 w-[3px] rounded-r-full bg-accent" />}
      {children}
      {!!badge && (
        <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white tabular-nums">
          {badge}
        </span>
      )}
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-full z-50 ml-3 flex items-center gap-2 rounded-md border border-edge bg-panel-raised px-2 py-1 text-[12px] whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-hover:delay-300">
        {label}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </button>
  );
}
