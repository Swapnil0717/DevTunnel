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
 * Asset: `public/train-footer-wide-3.gif` — 1920x313, transparent background.
 * Built from the original `train-footer.gif` (760x313, kept untouched): same
 * height, same artwork at 1:1 scale, but the viaduct is extended sideways by
 * repeating its arch pattern and the train now crosses the full width at a constant speed (about 110px/s). Nothing is
 * stretched. The image is pinned to 313px tall and fills the container width
 * with `object-cover`. Responsive height: 170px on phones, 220px from 480px,
 * 270px from md, the full 313px from lg. Because the artwork is 313px tall, a
 * shorter box scales the whole scene down (nothing is cut off top or bottom)
 * instead of cropping it, so a phone isn't left with a 313px band of mostly
 * sky; if the box is wider than the scaled image, the sides crop equally. `loading="lazy"` keeps the image from
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
      className="pointer-events-none mt-4 w-full select-none overflow-hidden bg-bg sm:mt-8 lg:mt-10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF: next/image would need `unoptimized` anyway */}
      <img
        src="/train-footer-wide-3.gif"
        alt=""
        width={1920}
        height={313}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block h-[170px] w-full object-cover object-center min-[480px]:h-[220px] md:h-[270px] lg:h-[313px]"
      />
    </div>
  );
}