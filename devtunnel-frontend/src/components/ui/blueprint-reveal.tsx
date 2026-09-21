// src/components/ui/blueprint-reveal.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Bridges `loading.tsx`'s blueprint sheet into the real page it
 * precedes. Next has no hook for "the route just finished loading" —
 * it swaps a `loading.tsx` fallback for the real segment the instant
 * streaming finishes, with no way to animate that swap from inside
 * `loading.tsx` itself. So the real page animates the exit instead:
 * `BlueprintReveal` paints one more copy of the blueprint grid directly
 * over its own children the moment it mounts — continuous with the last
 * frame `HomeLoading` left on screen, since it's the same
 * `.blueprint-sheet` background (no ruler strip or labels needed here;
 * those were already seen during the loading phase) — then wipes that
 * grid away top to bottom (`.blueprint-wipe`, globals.css), the same
 * reveal direction the recent.design reference uses.
 *
 * Usage: wrap a route's real content —
 * `<BlueprintReveal><PageContent /></BlueprintReveal>` — on a
 * `relative`-positioned ancestor sized to the same area `loading.tsx`
 * covered (see `(protected)/home/page.tsx`'s `<main>`), so the overlay
 * lines up with where the sheet was, not the whole viewport.
 *
 * Three phases, `covering` → `wiping` → `done`:
 *  - `covering` (first paint, including SSR): the overlay is fully
 *    opaque, matching `loading.tsx`'s last frame with zero gap between
 *    them.
 *  - `wiping`: set one animation frame after mount so the browser
 *    actually paints the `covering` frame first — without that frame,
 *    the wipe class would sometimes land on the very first paint and
 *    the animation would have nothing to animate from.
 *  - `done`: the overlay unmounts outright (not just hidden) once its
 *    animation ends, so it stops taking up space in the accessibility
 *    tree and can't catch stray pointer events.
 *
 * No `prefers-reduced-motion` branch is needed here — the blanket rule
 * in globals.css already collapses every animation's duration to
 * ~0.001ms for that preference, so this still resolves to `done`
 * almost immediately without any extra logic, the same as every other
 * animation in the app.
 */
export function BlueprintReveal({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"covering" | "wiping" | "done">("covering");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("wiping"));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {children}
      {phase !== "done" ? (
        <div
          aria-hidden="true"
          onAnimationEnd={() => setPhase("done")}
          className={`blueprint-sheet pointer-events-none absolute inset-0 z-50 ${
            phase === "wiping" ? "blueprint-wipe" : ""
          }`}
        />
      ) : null}
    </>
  );
}
