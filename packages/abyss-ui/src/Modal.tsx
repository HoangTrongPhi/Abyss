import { useEffect, type ReactNode } from "react";
import { cn } from "./cn";
import { X } from "./icons";

/** Centered dialog over a dimmed backdrop; Esc and a backdrop click close it. */
export function Modal({ open, title, onClose, footer, className, closeLabel = "Close", children }: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
  /** Accessible name of the × button, in the app's language. */
  closeLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/50 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cn("flex max-h-full w-full max-w-lg animate-pop-in flex-col rounded-xl border border-edge-strong bg-panel shadow-2xl", className)}>
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-edge pr-2 pl-4">
          <div className="text-[13px] font-semibold text-ink">{title}</div>
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-edge px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
