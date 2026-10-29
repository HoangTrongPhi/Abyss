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

export function Terminal({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="m4 17 6-6-6-6M12 19h8" />
    </Glyph>
  );
}

export function ChevronDown({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  );
}

export function Trash({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Glyph>
  );
}

export function Copy({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Glyph>
  );
}

export function Search({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Glyph>
  );
}

export function CornerDownLeft({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5" />
    </Glyph>
  );
}

export function Eye({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M7 7h10v10M7 17 17 7" />
    </Glyph>
  );
}

export function Globe({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
    </Glyph>
  );
}

export function MapPin({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </Glyph>
  );
}

export function Mail({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Glyph>
  );
}

export function Link({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Glyph>
  );
}

export function FileText({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8" />
    </Glyph>
  );
}

export function Clock({ className }: { className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Glyph>
  );
}
