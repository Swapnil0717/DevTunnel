"use client";

import { useEffect, useRef } from "react";

/**
 * The animated curtain behind the landing page and the login page: vertical
 * colour folds that drift sideways and fade to black, with a dot-matrix layer
 * flickering over the upper half.
 *
 * One fixed canvas sits behind everything, so the same background shows
 * under every section as the page scrolls. It is decorative (`aria-hidden`),
 * ignores pointer events, and is the only moving thing outside the hero.
 *
 * Cost control: the colour field is drawn at a quarter (phones: a sixth) of
 * the screen resolution and scaled up, frames are capped at about 30 per
 * second, and the loop stops while the tab is hidden. With "reduce motion"
 * on, a single still frame is drawn and redrawn on resize.
 */

const STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 106, 0],
  [255, 45, 58],
  [200, 38, 211],
  [124, 58, 237],
  [37, 99, 235],
  [6, 182, 212],
  [22, 163, 74],
  [250, 204, 21],
];

const FRAME_MS = 1000 / 30;

function palette(u: number): [number, number, number] {
  const k = Math.max(0, Math.min(0.9999, u)) * (STOPS.length - 1);
  const i = Math.floor(k);
  const f = k - i;
  const a = STOPS[i] ?? STOPS[0]!;
  const b = STOPS[i + 1] ?? a;
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

function fold(x: number, t: number): number {
  return (
    0.5 +
    0.5 *
      Math.sin(x * 0.11 + Math.sin(x * 0.017 + t * 0.35) * 3 + t * 0.5) *
      (0.6 + 0.4 * Math.sin(x * 0.29 - t * 0.3))
  );
}

export function CurtainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const field = document.createElement("canvas");
    const fieldCtx = field.getContext("2d");
    if (!fieldCtx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();

    let W = 0;
    let H = 0;
    let S = 4;
    let image: ImageData | null = null;
    let raf = 0;
    let last = 0;
    let lens = new Float32Array(0);

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      S = W < 700 ? 6 : 4;
      field.width = Math.ceil(W / S);
      field.height = Math.ceil(H / S);
      image = fieldCtx!.createImageData(field.width, field.height);
    }

    function draw(now: number) {
      if (!image) return;
      const t = (now - start) / 1000;
      const w = field.width;
      const h = field.height;
      const d = image.data;

      // Per-column values only depend on x, so compute them once per frame.
      const cols = new Float32Array(w * 4);
      for (let x = 0; x < w; x++) {
        const f = fold(x, t);
        const g = fold(x * 1.7 + 40, t * 0.8);
        const c = palette(x / w + 0.03 * Math.sin(t * 0.25 + x * 0.05));
        cols[x * 4] = c[0];
        cols[x * 4 + 1] = c[1];
        cols[x * 4 + 2] = c[2];
        cols[x * 4 + 3] = 0.55 + 0.6 * f;
        lens[x] = 0.5 + 0.4 * g;
      }

      let p = 0;
      for (let y = 0; y < h; y++) {
        const fy = y / h;
        for (let x = 0; x < w; x++, p += 4) {
          let v = Math.max(0, 1 - fy / lens[x]!);
          v = v * v * cols[x * 4 + 3]!;
          d[p] = cols[x * 4]! * v;
          d[p + 1] = cols[x * 4 + 1]! * v;
          d[p + 2] = cols[x * 4 + 2]! * v;
          d[p + 3] = 255;
        }
      }
      fieldCtx!.putImageData(image, 0, 0);
      ctx!.imageSmoothingEnabled = true;
      ctx!.drawImage(field, 0, 0, W, H);

      // Dot-matrix layer over the upper half.
      const step = W < 700 ? 12 : 16;
      const rows = Math.floor((H * 0.5) / step);
      const dotCols = Math.ceil(W / step);
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < dotCols; q++) {
          const px = q * step + step / 2;
          const py = r * step + step / 2;
          const ix = Math.min(w - 1, (px / S) | 0);
          const n = fold(ix * 1.3 + r * 0.6, t * 0.9);
          const a =
            (0.85 - py / (H * 0.5)) * n * (0.35 + 0.65 * fold(ix, t)) * 1.1;
          if (a < 0.12) continue;
          const cc = palette(px / W + 0.03 * Math.sin(t * 0.25 + ix * 0.05));
          ctx!.fillStyle = `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${Math.min(0.9, a)})`;
          ctx!.fillRect(px - 2, py - 2, 4, 4);
        }
      }
    }

    function sizeAll() {
      resize();
      lens = new Float32Array(field.width);
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    }

    function onResize() {
      sizeAll();
      if (reduce) draw(performance.now());
    }

    sizeAll();
    if (reduce) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="lp-fx" />
      <div aria-hidden="true" className="lp-shade" />
    </>
  );
}
