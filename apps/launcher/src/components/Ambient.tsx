import type { CSSProperties } from "react";

/** Spread out but fixed, so the backdrop looks the same at every start. */
const BUBBLES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37 + 9) % 100,
  size: 2 + ((i * 7) % 4),
  duration: 17 + ((i * 11) % 15),
  delay: -((i * 5.3) % 26),
  sway: ((i % 5) - 2) * 7,
}));

/** Deep-water backdrop behind the pages (styles in `styles.css`, switched by Settings → Effects). */
export function Ambient() {
  return (
    <div className="fx-ambient pointer-events-none absolute inset-0 overflow-hidden [contain:strict]" aria-hidden="true">
      <div className="fx-loop abyss-glow abyss-glow-a" />
      <div className="fx-loop abyss-glow abyss-glow-b" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="fx-loop abyss-bubble"
          style={{ left: `${b.left}%`, "--size": `${b.size}px`, "--sway": `${b.sway}px`, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}
