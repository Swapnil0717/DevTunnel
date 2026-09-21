// devtunnel-frontend/src/components/layout/train-footer.tsx

/**
 * Decorative footer: the animated train GIF, shown ONCE (no tiling), at the
 * very bottom of the page content.
 *
 * Where it lives: inside the content column of each shell layout
 * (`AppShell`, the admin layout) — never at the root, never under the
 * sidebar. The sidebars are `position: fixed`, so this footer scrolling
 * into view can't push, shrink or otherwise move them.
 *
 * Colour: the wrapper paints the app's own `bg` token, and the GIF has a
 * transparent background (its linework is grayscale, no pixel darker than
 * #1E1E1E), so the scene sits on exactly the page colour instead of a
 * black rectangle. Nothing here hardcodes a background colour — change
 * `bg` in tailwind.config.ts and the footer follows. The left/right edges
 * are dissolved with a CSS mask (not a colour-matched gradient overlay)
 * so the viaduct fades into the page whatever the page colour is.
 *
 * Asset: `public/train-footer.gif` — 760x313, 52 frames, transparent
 * background. `width`/`height` are set so the browser reserves the space
 * before it downloads, and `loading="lazy"` keeps a multi-megabyte image
 * from competing with the page's real content: it sits below the fold.
 *
 * Purely decorative: empty `alt` + `aria-hidden` keep it out of the
 * accessibility tree, `pointer-events-none` keeps it out of the way of
 * clicks/taps.
 */
const EDGE_FADE =
  "linear-gradient(to right, transparent 0%, #000 18%, #000 82%, transparent 100%)";

export function TrainFooter() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-6 flex w-full select-none justify-center overflow-hidden bg-bg sm:mt-10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF: next/image would need `unoptimized` anyway */}
      <img
        src="/train-footer.gif"
        alt=""
        width={760}
        height={313}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-[150px] w-auto max-w-full object-contain object-bottom sm:h-[230px] lg:h-[280px]"
        style={{ WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE }}
      />
    </div>
  );
}
