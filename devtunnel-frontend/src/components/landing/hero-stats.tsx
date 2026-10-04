"use client";

import { useEffect, useRef } from "react";

const STATS = [
  { glyph: ">", value: 5, label: "CLI commands" },
  { glyph: "#", value: 4, label: "Tracked task stages" },
  { glyph: "@", value: 6, label: "Developer roles" },
  { glyph: "+", value: 3, label: "Experience levels" },
] as const;

/**
 * The four figures under the hero. The final numbers are in the server-
 * rendered HTML, so the page is complete without JS; on load each one counts
 * up once (skipped when the visitor prefers reduced motion).
 */
export function HeroStats() {
  const refs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: number[] = [];
    const frames: number[] = [];

    refs.current.forEach((el, i) => {
      if (!el) return;
      const target = STATS[i]?.value ?? 0;
      const duration = 1500 + i * 80;
      el.textContent = "0";

      timers.push(
        window.setTimeout(() => {
          let begin: number | null = null;
          const step = (ts: number) => {
            if (begin === null) begin = ts;
            const p = Math.min((ts - begin) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = String(Math.round(target * eased));
            if (p < 1) frames.push(requestAnimationFrame(step));
          };
          frames.push(requestAnimationFrame(step));
        }, 480 + i * 90),
      );
    });

    return () => {
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
    };
  }, []);

  return (
    <ul className="lp-stats" aria-label="DevTunnel at a glance">
      {STATS.map((s, i) => (
        <li key={s.label}>
          <span className="lp-stat-glyph" aria-hidden="true">
            {s.glyph}
          </span>
          <span className="lp-stat-value">
            <span
              ref={(el) => {
                refs.current[i] = el;
              }}
            >
              {s.value}
            </span>
          </span>
          <span className="lp-stat-label">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
