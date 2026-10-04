// devtunnel-frontend/src/components/layout/train-footer.tsx

/**
 * Decorative footer: the animated train GIF, shown ONCE (no tiling),
 * stretched edge to edge so it touches the left and right ends of the page
 * content, at the very bottom of the page content.
 *
 * Where it lives: inside the content column of each shell layout
 * (`AppShell`, the admin layout) — never at the root, never under the
 * sidebar. The sidebars are `position: fixed`, so this footer scrolling
 * into view can't push, shrink or otherwise move them.
 *
 * Sizing: the GIF fills the full width of its container and its height
 * follows the 760:313 aspect ratio, so the train and viaduct are never
 * distorted. There is no edge fade — the viaduct runs right up to both
 * edges and the train enters and leaves the scene at the page edges.
 *
 * Colour: the wrapper paints the app's own `bg` token, and the GIF has a
 * transparent background (its linework is grayscale, no pixel darker than
 * #1E1E1E), so the scene sits on exactly the page colour instead of a
 * black rectangle. Nothing here hardcodes a background colour — change
 * `bg` in tailwind.config.ts and the footer follows.
 *
 * Asset: `public/train-footer-wide-2.gif` — 1920x313, transparent background.
 * Built from the original `train-footer.gif` (760x313, kept untouched): same
 * height, same artwork at 1:1 scale, but the viaduct is extended sideways by
 * repeating its arch pattern and the train now crosses the full width at a constant speed (about 200px/s). Nothing is
 * stretched. The image is pinned to 313px tall and fills the container width
 * with `object-cover`, so wider screens show it slightly enlarged and narrower
 * ones crop equally from both sides. `loading="lazy"` keeps the image from
 * competing with the page's real content: it sits below the fold.
 *
 * Purely decorative: empty `alt` + `aria-hidden` keep it out of the
 * accessibility tree, `pointer-events-none` keeps it out of the way of
 * clicks/taps.
 */
 export function TrainFooter() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-6 w-full select-none overflow-hidden bg-bg sm:mt-10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF: next/image would need `unoptimized` anyway */}
      <img
        src="/train-footer-wide-2.gif"
        alt=""
        width={1920}
        height={313}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block h-[313px] w-full object-cover object-center"
      />
    </div>
  );
}