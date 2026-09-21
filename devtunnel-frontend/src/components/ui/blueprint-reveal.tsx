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
 * ~1.35s to fill and finish drawing — see `.blueprint-sheet-content` in
 * globals.css). Change it here, in one place, to make every route's
 * loading animation longer or shorter.
 */
export const BLUEPRINT_MIN_VISIBLE_MS = 1600;

/**
 * Even when the data was slow and the sheet has long since finished
 * drawing, hold the fully drawn sheet for this long after the real page
 * arrives, so the content never appears in the same instant as the swap.
 */
export const BLUEPRINT_MIN_HOLD_MS = 350;

/**
 * How long the loaded content sits on the blueprint before the sheet
 * lifts off to reveal the page's own background — the beat in the
 * reference where the text is readable on the blue and only then does
 * the page "colour in".
 */
export const BLUEPRINT_SETTLE_MS = 700;

/** Keep in sync with `.blueprint-wipe` in globals.css. */
const BLUEPRINT_WIPE_MS = 800;

type BlueprintPhase = "covering" | "revealing" | "settled" | "lifting" | "done";

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
 * precedes, and plays the rest of the recent.design "page load"
 * sequence. Next has no hook for "the route just finished loading" — it
 * swaps a `loading.tsx` fallback for the real segment the instant
 * streaming finishes, with no way to animate that swap from inside
 * `loading.tsx` itself. So the real page animates the exit instead, in
 * four beats:
 *
 *  1. `covering` — the route's own loading sheet (`skeleton`, the same
 *     component `loading.tsx` renders) is painted over the page,
 *     continuing its drawing animation from where the loading screen
 *     left off, and held until it has been visible for at least
 *     `BLUEPRINT_MIN_VISIBLE_MS` in total. The real content is hidden
 *     behind it.
 *  2. `revealing` — that cover wipes away top to bottom
 *     (`.blueprint-wipe`), taking the placeholder blocks with it and
 *     uncovering the REAL CONTENT — drawn on the blueprint's own green,
 *     because a second copy of the plain sheet (the "backdrop") sits
 *     behind the content the whole time.
 *  3. `settled` — content on blueprint, held for `BLUEPRINT_SETTLE_MS`
 *     so the data is actually seen loading in.
 *  4. `lifting` — the backdrop wipes away top to bottom, revealing the
 *     app's real page colour underneath. Then `done`: both layers are
 *     unmounted outright, so nothing can catch pointer events or sit in
 *     the accessibility tree.
 *
 * The backdrop is positioned `-z-10` inside this component's own
 * `isolate` stacking context, which paints it above the app shell's
 * background but below every in-flow child — so children never need a
 * wrapper or a z-index of their own.
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
 * layers over that. Pass `inline` when the caller already provides a
 * positioned, isolated ancestor that should define their area (Home's
 * padded `<main>`).
 *
 * `prefers-reduced-motion`: every wait below collapses to zero and the
 * blanket rule in globals.css collapses the animations, so the layers
 * resolve to `done` almost immediately.
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
  /** Skip the wrapper; the layers fill the nearest positioned ancestor. */
  inline?: boolean;
  /**
   * Classes for the wrapper (ignored with `inline`). Must keep `relative`
   * and `isolate` — the first anchors the layers, the second keeps their
   * z-indexes from climbing over the app's fixed bottom nav. Default is a
   * flex column, matching the app shell's own content slot; admin pages
   * pass a plain block wrapper because their slot is a block container
   * and `mx-auto` mains behave differently in a flex column.
   */
  className?: string;
}) {
  const [phase, setPhase] = useState<BlueprintPhase>("covering");
  const coverRef = useRef<HTMLDivElement>(null);
  // Read the loading sheet's clock exactly once. A ref (not a value
  // recomputed inside the effect) so React StrictMode's dev-only second
  // pass through the effect below reuses it instead of finding the clock
  // already consumed and resetting the offset to zero.
  const elapsedRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

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

    coverRef.current?.style.setProperty("--bp-elapsed", `${Math.round(elapsedMs)}ms`);

    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const waitMs = reducedMotionRef.current
      ? 0
      : Math.max(BLUEPRINT_MIN_VISIBLE_MS - elapsedMs, BLUEPRINT_MIN_HOLD_MS);

    const timer = window.setTimeout(() => setPhase("revealing"), waitMs);
    return () => window.clearTimeout(timer);
  }, []);

  // Everything after the first wait is a plain timer chain. Timers rather
  // than `animationend`: that event bubbles from every block's own
  // animation and never fires at all in a background tab.
  useEffect(() => {
    const scale = reducedMotionRef.current ? 0 : 1;
    const next: Partial<Record<BlueprintPhase, [BlueprintPhase, number]>> = {
      revealing: ["settled", BLUEPRINT_WIPE_MS * scale],
      settled: ["lifting", BLUEPRINT_SETTLE_MS * scale],
      lifting: ["done", BLUEPRINT_WIPE_MS * scale],
    };
    const step = next[phase];
    if (!step) return;
    const timer = window.setTimeout(() => setPhase(step[0]), step[1]);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const coverVisible = phase === "covering" || phase === "revealing";
  const backdropVisible = phase !== "done";

  const layers = (
    <BlueprintOverlayContext.Provider value={true}>
      {backdropVisible ? (
        <div
          aria-hidden="true"
          className={`blueprint-sheet pointer-events-none absolute inset-0 -z-10 ${
            phase === "lifting" ? "blueprint-wipe" : ""
          }`}
        />
      ) : null}
      {coverVisible ? (
        <div
          ref={coverRef}
          aria-hidden="true"
          className={`blueprint-sheet blueprint-overlay absolute inset-0 z-50 overflow-hidden ${
            phase === "revealing" ? "blueprint-wipe pointer-events-none" : ""
          }`}
        >
          {skeleton}
        </div>
      ) : null}
    </BlueprintOverlayContext.Provider>
  );

  if (inline) {
    return (
      <>
        {children}
        {layers}
      </>
    );
  }

  return (
    <div className={className}>
      {children}
      {layers}
    </div>
  );
}
