import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "./cn";
import { ChevronDown, Copy, Terminal, Trash } from "./icons";
import { PillBadge } from "./PillBadge";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** One line of the structured log (Rust `utils/logbus.rs` emits these as `log://entry`). */
export interface LogEntry {
  tsMs: number;
  level: LogLevel;
  source: string;
  message: string;
}

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: "text-ink-faint",
  info: "text-ink",
  warn: "text-amber",
  error: "text-rose",
};
const LEVEL_TONE = { debug: "neutral", info: "accent", warn: "amber", error: "rose" } as const;

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour12: false });
const asText = (e: LogEntry) => `${fmtTime(e.tsMs)} ${e.level.toUpperCase().padEnd(5)} ${e.source}: ${e.message}`;

/**
 * Collapsible bottom terminal for structured log entries from Rust and the UI.
 * Level pills filter (debug hidden by default), the list follows the tail unless scrolled up,
 * the top edge resizes it.
 */
export function LogDrawer({ entries, open, onToggle, onClear, filter, height: initialHeight = 180 }: {
  entries: LogEntry[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  /** Levels shown at first. */
  filter?: LogLevel[];
  height?: number;
}) {
  const [shown, setShown] = useState<Set<LogLevel>>(() => new Set(filter ?? ["info", "warn", "error"]));
  const [height, setHeight] = useState(initialHeight);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const l of entries) c[l.level]++;
    return c;
  }, [entries]);
  const visible = useMemo(() => entries.filter((l) => shown.has(l.level)), [entries, shown]);

  const toggleLevel = (lvl: LogLevel) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (!next.delete(lvl)) next.add(lvl);
      return next;
    });

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setHeight(Math.round(Math.min(Math.max(startH + (startY - ev.clientY), 96), 600)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const copyAll = () => void navigator.clipboard?.writeText(visible.map(asText).join("\n")).catch(() => {});

  return (
    <section className="relative shrink-0 border-t border-edge bg-panel" style={{ height: open ? height : 32 }}>
      {open && <div onPointerDown={startResize} className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" />}
      <div className="flex h-8 items-center gap-2 px-3">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-[12px] font-medium text-ink-muted hover:text-ink">
          <Terminal className="size-3.5" />
          Log
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "rotate-180")} />
        </button>
        <div className="ml-2 flex items-center gap-1">
          {LEVELS.map((lvl) => (
            <button key={lvl} type="button" onClick={() => toggleLevel(lvl)} title={`${shown.has(lvl) ? "Hide" : "Show"} ${lvl}`}>
              <PillBadge tone={shown.has(lvl) ? LEVEL_TONE[lvl] : "neutral"} className={cn(!shown.has(lvl) && "opacity-50")}>
                {lvl} {counts[lvl]}
              </PillBadge>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" onClick={copyAll} className="icon-btn size-6" aria-label="Copy log" title="Copy visible lines">
          <Copy className="size-3.5" />
        </button>
        <button type="button" onClick={onClear} className="icon-btn size-6" aria-label="Clear log" title="Clear log">
          <Trash className="size-3.5" />
        </button>
      </div>
      {open && <LogLines entries={visible} height={height - 32} />}
    </section>
  );
}

function LogLines({ entries, height }: { entries: LogEntry[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Follow the tail unless the user scrolled up to read history.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries, height]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => (stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="overflow-y-auto px-3 pb-2 font-mono text-[11.5px] leading-[18px] select-text" style={{ height }}>
      {entries.length === 0 && <div className="text-ink-faint">No log output.</div>}
      {entries.map((e, i) => (
        <div key={i} className={cn("flex gap-3 whitespace-pre-wrap", LEVEL_STYLE[e.level])}>
          <span className="shrink-0 text-ink-faint">{fmtTime(e.tsMs)}</span>
          <span className="w-12 shrink-0 uppercase opacity-80">{e.level}</span>
          <span className="w-16 shrink-0 truncate text-ink-faint">{e.source}</span>
          <span className="min-w-0 break-words">{e.message}</span>
        </div>
      ))}
    </div>
  );
}
