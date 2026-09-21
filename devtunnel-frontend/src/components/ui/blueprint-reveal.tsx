// src/components/ui/blueprint-reveal.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Total time the blueprint sheet is guaranteed to be on screen, counted
 * from the moment `loading.tsx` first painted it. A fast route would
 * otherwise swap to the real page after a few milliseconds and nobody
 * would ever see the sheet draw itself, so `BlueprintReveal` keeps the
 * sheet up until this much time has passed in total (the sheet takes
 * ~1.1s to finish drawing — see `.blueprint-sheet-content` in
 * globals.css). Change it here, in one place, to make every route's
 * loading animation longer or shorter.
 */
export const BLUEPRINT_MIN_VISIBLE_MS = 1400;

/**
 * Even when the data was slow and the sheet has long since finished
 * drawing, hold the fully drawn sheet for this long after the real page
 * arrives, so the wipe never fires in the same instant as the swap.
 */
export const BLUEPRINT_MIN_HOLD_MS = 350;

/** Keep in sync with `.blueprint-wipe` in globals.css. */
const BLUEPRINT_WIPE_MS = 800;

/**
 * A `loading.tsx` sheet that was on screen a moment ago and an overlay
 * copy of it are both `BlueprintSheet`s. Only the first should start the
 * "how long has the sheet been visible" clock, so the overlay marks
 * itself through this context.
 */
const BlueprintOverlayContext = createContext(false);

type BlueprintClockWindow = Window & {
  __blueprintShownAt?: number;
  __blueprintLeftAt?: number;
};

// `useLayoutEffect` warns during SSR; nothing here needs to run there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Rendered once by every `BlueprintSheet`. Records when the loading
 * sheet appeared and when it was removed, so the `BlueprintReveal` that
 * replaces it can tell how much of the drawing animation the user has
 * already watched and continue from that exact point rather than
 * restarting it (which would flash an empty grid in between).
 *
 * Layout effects on purpose: React runs the removed tree's layout-effect
 * cleanups before the new tree's layout effects, so `leftAt` is already
 * written by the time `BlueprintReveal` reads it. A passive effect would
 * run a frame too late and the reveal would paint once with no offset.
 */
export function BlueprintClock() {
  const inOverlay = useContext(BlueprintOverlayContext);

  useIsomorphicLayoutEffect(() => {
    if (inOverlay) return;
    const clockWindow = window as BlueprintClockWindow;
    clockWindow.__blueprintShownAt = performance.now();
    clockWindow.__blueprintLeftAt = undefined;
    return () => {
      clockWindow.__blueprintLeftAt = performance.now();
    };
  }, [inOverlay]);

  return null;
}

/**
 * Bridges `loading.tsx`'s blueprint sheet into the real page it
 * precedes. Next has no hook for "the route just finished loading" — it
 * swaps a `loading.tsx` fallback for the real segment the instant
 * streaming finishes, with no way to animate that swap from inside
 * `loading.tsx` itself. So the real page animates the exit instead.
 *
 * `BlueprintReveal` paints the route's own loading sheet (`skeleton`,
 * the same component `loading.tsx` renders) directly over its children
 * the moment it mounts, continues its drawing animation from where the
 * loading screen left off, keeps it up for at least
 * `BLUEPRINT_MIN_VISIBLE_MS` in total, then wipes it away top to bottom
 * (`.blueprint-wipe`, globals.css) to reveal the real content — the
 * "page load animation" reference from recent.design: skeleton draws
 * itself, then the page appears from behind it.
 *
 * Usage — wrap a route's real content and hand it the route's own
 * loading component:
 *
 *   import Loading from "./loading";
 *   <BlueprintReveal skeleton={<Loading />}>
 *     <main>…</main>
 *   </BlueprintReveal>
 *
 * By default it renders its own `relative isolate` wrapper
 * (`min-h-screen`, the same height the loading sheet has) and lays the
 * overlay over that.
 * Pass `inline` when the caller already provides a positioned ancestor
 * that should define the overlay's area (Home's padded `<main>`).
 *
 * Three phases, `covering` → `wiping` → `done`:
 *  - `covering` (first paint, including SSR): the overlay is fully
 *    opaque, so the real page never flashes through before the wipe.
 *  - `wiping`: starts once the minimum on-screen time has passed.
 *  - `done`: the overlay unmounts outright (not just hidden) once its
 *    animation ends, so it can't catch pointer events or sit in the
 *    accessibility tree.
 *
 * `prefers-reduced-motion`: the blanket rule in globals.css collapses
 * every animation's duration, and the hold timers below are skipped, so
 * the overlay resolves to `done` almost immediately.
 */
export function BlueprintReveal({
  children,
  skeleton,
  inline = false,
  className = "relative isolate flex min-h-screen w-full flex-col",
}: {
  children: ReactNode;
  /** The route's own loading sheet, e.g. `<Loading />` from `./loading`. */
  skeleton?: ReactNode;
  /** Skip the wrapper; the overlay fills the nearest positioned ancestor. */
  inline?: boolean;
  /**
   * Classes for the wrapper (ignored with `inline`). Must keep `relative`
   * and `isolate` — the first anchors the overlay, the second keeps its
   * z-index from climbing over the app's fixed bottom nav. Default is a
   * flex column, matching the app shell's own content slot; admin pages
   * pass a plain block wrapper because their slot is a block container
   * and `mx-auto` mains behave differently in a flex column.
   */
  className?: string;
}) {
  const [phase, setPhase] = useState<"covering" | "wiping" | "done">("covering");
  const overlayRef = useRef<HTMLDivElement>(null);
  // Read the loading sheet's clock exactly once. A ref (not a value
  // recomputed inside the effect) so React StrictMode's dev-only second
  // pass through the effect below reuses it instead of finding the clock
  // already consumed and resetting the offset to zero.
  const elapsedRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (elapsedRef.current === null) {
      const clockWindow = window as BlueprintClockWindow;
      const shownAt = clockWindow.__blueprintShownAt;
      const leftAt = clockWindow.__blueprintLeftAt;
      clockWindow.__blueprintShownAt = undefined;
      clockWindow.__blueprintLeftAt = undefined;

      // Only trust the clock if the loading sheet was on screen right up
      // until this page mounted — a stale stamp from an earlier
      // navigation must not fast-forward this one.
      elapsedRef.current =
        shownAt !== undefined && leftAt !== undefined && performance.now() - leftAt < 600
          ? Math.max(0, leftAt - shownAt)
          : 0;
    }
    const elapsedMs = elapsedRef.current ?? 0;

    overlayRef.current?.style.setProperty("--bp-elapsed", `${Math.round(elapsedMs)}ms`);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const waitMs = reducedMotion
      ? 0
      : Math.max(BLUEPRINT_MIN_VISIBLE_MS - elapsedMs, BLUEPRINT_MIN_HOLD_MS);

    const timer = window.setTimeout(() => setPhase("wiping"), waitMs);
    return () => window.clearTimeout(timer);
  }, []);

  // Safety net: if the browser never fires `animationend` (tab in the
  // background, animations disabled), don't leave the overlay up forever.
  useEffect(() => {
    if (phase !== "wiping") return;
    const timer = window.setTimeout(() => setPhase("done"), BLUEPRINT_WIPE_MS + 400);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const overlay =
    phase !== "done" ? (
      <BlueprintOverlayContext.Provider value={true}>
        <div
          ref={overlayRef}
          aria-hidden="true"
          onAnimationEnd={(event) => {
            // Bubbles up from every block's own draw animation — only the
            // overlay's own wipe finishing means we're done.
            if (event.target === event.currentTarget && phase === "wiping") setPhase("done");
          }}
          className={`blueprint-sheet blueprint-overlay absolute inset-0 z-50 overflow-hidden ${
            phase === "wiping" ? "blueprint-wipe pointer-events-none" : ""
          }`}
        >
          {skeleton}
        </div>
      </BlueprintOverlayContext.Provider>
    ) : null;

  if (inline) {
    return (
      <>
        {children}
        {overlay}
      </>
    );
  }

  return (
    <div className={className}>
      {children}
      {overlay}
    </div>
  );
}
