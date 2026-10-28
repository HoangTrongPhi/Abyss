import { cn } from "@abyss/ui";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useT } from "../i18n";
import { useUiStore } from "../stores/uiStore";

const ICONS = { info: Info, success: CheckCircle2, error: TriangleAlert };

export function Toasts() {
  const t = useT();
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div key={toast.id} className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-lg border border-edge-strong bg-panel-raised px-3 py-2.5 shadow-xl">
            <Icon className={cn("mt-0.5 size-4 shrink-0", toast.tone === "success" ? "text-emerald" : toast.tone === "error" ? "text-rose" : "text-accent")} />
            <p className="min-w-0 flex-1 text-[12.5px] break-words text-ink select-text">{toast.text}</p>
            <button type="button" className="text-ink-faint hover:text-ink" aria-label={t.common.dismiss} onClick={() => dismiss(toast.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
