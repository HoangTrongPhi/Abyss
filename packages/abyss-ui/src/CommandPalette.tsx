import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { CornerDownLeft, Search } from "./icons";

export interface PaletteItem {
  id: string;
  label: string;
  /** Shown on the right (a shortcut, a path). */
  hint?: string;
  /** Heading the item is listed under while the query is empty. */
  group?: string;
  icon?: ReactNode;
  /** Extra words the fuzzy search also matches. */
  keywords?: string;
  run(): void | Promise<unknown>;
}

/** Subsequence fuzzy score; higher is better, -1 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - (found - ti);
    ti = found + 1;
  }
  return score;
}

/** Spotlight-style launcher: fuzzy search, arrow keys, Enter runs, Esc closes. */
export function CommandPalette({ open, onClose, items, onError, placeholder = "Type a command or search…" }: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  /** Called when an item's `run` throws or rejects. */
  onError?: (item: PaletteItem, err: unknown) => void;
  placeholder?: string;
}) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} items={items} onError={onError} placeholder={placeholder} />;
}

function PaletteDialog({ onClose, items, onError, placeholder }: {
  onClose: () => void;
  items: PaletteItem[];
  onError?: (item: PaletteItem, err: unknown) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, c.keywords ?? "") - 200) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c);
  }, [items, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    try {
      Promise.resolve(item.run()).catch((err) => onError?.(item, err));
    } catch (err) {
      onError?.(item, err);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Group headings only when browsing the full list; ranked results read better flat.
  const grouped = !query.trim();

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in justify-center bg-black/50 pt-[14vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="flex h-fit max-h-[60vh] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-xl border border-edge-strong bg-panel shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <Search className="size-4 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            spellCheck={false}
            aria-activedescendant={results[cursor] ? `cmd-${results[cursor].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} className="overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 && <div className="px-3 py-6 text-center text-[12px] text-ink-faint">No matching commands</div>}
          {results.map((item, i) => (
            <div key={item.id}>
              {grouped && item.group && (i === 0 || results[i - 1].group !== item.group) && (
                <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">{item.group}</div>
              )}
              <div
                id={`cmd-${item.id}`}
                data-index={i}
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => run(item)}
                className={cn("flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-[13px]", i === cursor ? "bg-accent/14 text-ink" : "text-ink-muted")}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center [&_svg]:size-4", i === cursor ? "text-accent" : "text-ink-faint")}>{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="max-w-[40%] truncate text-[11px] text-ink-faint">{item.hint}</span>}
                {i === cursor && <CornerDownLeft className="size-3.5 text-ink-faint" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
