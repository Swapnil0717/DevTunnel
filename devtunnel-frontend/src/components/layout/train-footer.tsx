// devtunnel-frontend/src/components/layout/train-footer.tsx
"use client";

/**
 * Decorative footer shown at the bottom of every page. Renders the
 * animated train GIF (background stripped to transparent, linework
 * recolored to pure grayscale with a high-contrast curve — most of
 * the scene reads as true black, with only the strongest edges lit
 * up white — so it sits on the app's black `bg` token instead of its
 * own white canvas) tiled edge-to-edge with CSS `background-repeat`,
 * so it always fills the viewport width regardless of screen size
 * without needing multiple `<img>` tags.
 *
 * Deliberately kept strictly black and white — no color tint, no
 * accent glow — so it reads as a black-and-white illustration rather
 * than a colored decoration.
 *
 * The asset lives at `public/train-footer.gif` — a trimmed/downscaled
 * copy of the original recording (760x313, 52 frames, transparent
 * background) so it stays a reasonable size to ship on every page.
 *
 * Purely decorative: `aria-hidden` + `pointer-events-none` keep it out
 * of the accessibility tree and out of the way of clicks/taps.
 */
export function TrainFooter() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none relative w-full h-[130px] sm:h-[190px] overflow-hidden bg-black"
    >
      {/* The tiled, looping train scene itself. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/train-footer.gif)",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "left bottom",
          backgroundSize: "auto 100%",
        }}
      />

      {/* Fade the top edge into the page background instead of a hard
          cut, so the footer blends with whatever content sits above
          it rather than looking clipped. Pure black, no color. */}
      <div
        className="absolute inset-x-0 top-0 h-10"
        style={{
          backgroundImage: "linear-gradient(to bottom, #000000 0%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}
