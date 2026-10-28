import type { ReactNode } from "react";

/** The few glyphs the shared components need, inline so the package has no icon dependency. */
function Glyph({ className = "size-4", children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function X({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Glyph>
  );
}

export function Moon({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </Glyph>
  );
}

export function Sun({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Glyph>
  );
}

export function Monitor({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Glyph>
  );
}

export function RotateCcw({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Glyph>
  );
}
