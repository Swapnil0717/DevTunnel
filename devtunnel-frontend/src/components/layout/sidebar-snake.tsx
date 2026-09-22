// devtunnel-frontend/src/components/layout/sidebar-snake.tsx
"use client";

import { useEffect, useRef } from "react";

/**
 * Playful overlay that draws a snake confined to an invisible track running
 * along the border of every sidebar nav item (plus the thin gap between
 * consecutive items). It never cuts across an item's center or the open
 * sidebar background — only the track itself, which is never rendered.
 *
 * Clicking a nav item sends the snake toward that item's border along the
 * track. If exactly one distinct item has ever been clicked, the snake
 * loops that item's own border forever once it arrives. As soon as a
 * second, different item is clicked, it keeps travelling the shared track
 * toward whatever gets clicked next instead of relocking.
 *
 * Colors are pulled straight from the app's own tokens (`bg-accent`
 * #1D9E75 for the body, `text-status-success-label` #5DCAA5 for the head
 * and food) so it reads as part of the UI rather than a foreign overlay.
 *
 * Pure DOM manipulation inside a ref, not React state, so the ~14fps game
 * tick never triggers a re-render of the sidebar (or fights its own
 * `transition-colors` hover/active animations). Disabled entirely under
 * `prefers-reduced-motion`, matching the reduced-motion handling already
 * established in globals.css.
 */

const CELL = 6;
const TICK_MS = 70;

type Point = { x: number; y: number };
type Range = { start: number; len: number };
type Mode = "idle" | "approach" | "border-loop";

type SidebarSnakeProps = {
  /** The `<ul>` (or any container) whose `a[data-snake-href]` children define the track. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Re-run track discovery when the visible link set changes (e.g. sign-in/out). */
  hrefs: readonly string[];
};

export function SidebarSnake({ containerRef, hrefs }: SidebarSnakeProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let masterPath: Point[] = [];
    let itemRanges: Record<string, Range> = {};
    let snake: Point[] = [];
    let pendingGrowth = 0;
    let mode: Mode = "idle";
    let headIdx = 0;
    let idleDir = 1;
    let targetIdx: number | null = null;
    let targetIsSingle = false;
    let activeRange: Range | null = null;
    let borderFoodLocal = 0;
    const clickedHrefs = new Set<string>();

    const segPool: HTMLDivElement[] = [];
    let ballEl: HTMLDivElement | null = null;

    function snap(v: number) {
      return Math.round(v / CELL);
    }

    function localRect(a: HTMLElement) {
      const ar = a.getBoundingClientRect();
      const nr = container!.getBoundingClientRect();
      return { x: ar.left - nr.left, y: ar.top - nr.top, w: ar.width, h: ar.height };
    }

    function rectLoop(rect: { x: number; y: number; w: number; h: number }): Point[] {
      let gx0 = snap(rect.x) + 1;
      let gy0 = snap(rect.y) + 1;
      let gx1 = snap(rect.x + rect.w) - 1;
      let gy1 = snap(rect.y + rect.h) - 1;
      if (gx1 <= gx0 + 1) gx1 = gx0 + 2;
      if (gy1 <= gy0 + 1) gy1 = gy0 + 2;
      const path: Point[] = [];
      let x, y;
      for (x = gx0; x < gx1; x++) path.push({ x, y: gy0 });
      for (y = gy0; y < gy1; y++) path.push({ x: gx1, y });
      for (x = gx1; x > gx0; x--) path.push({ x, y: gy1 });
      for (y = gy1; y > gy0; y--) path.push({ x: gx0, y });
      return path;
    }

    function buildMasterPath() {
      masterPath = [];
      itemRanges = {};
      const nr = container!.getBoundingClientRect();
      overlay!.style.width = `${nr.width}px`;
      overlay!.style.height = `${nr.height}px`;

      const anchors = Array.from(
        container!.querySelectorAll<HTMLAnchorElement>("a[data-snake-href]")
      );
      anchors.forEach((a) => {
        const rect = localRect(a);
        const ipath = rectLoop(rect);
        if (masterPath.length > 0) {
          const prevPoint = masterPath[masterPath.length - 1];
          const startPoint = ipath[0];
          if (prevPoint.x === startPoint.x) {
            for (let y = prevPoint.y + 1; y < startPoint.y; y++) {
              masterPath.push({ x: prevPoint.x, y });
            }
          } else if (prevPoint.y === startPoint.y) {
            const stepX = startPoint.x > prevPoint.x ? 1 : -1;
            for (let x = prevPoint.x + stepX; x !== startPoint.x; x += stepX) {
              masterPath.push({ x, y: prevPoint.y });
            }
          }
        }
        const href = a.dataset.snakeHref!;
        itemRanges[href] = { start: masterPath.length, len: ipath.length };
        masterPath = masterPath.concat(ipath);
      });
    }

    function pathPoint(idx: number): Point {
      idx = Math.max(0, Math.min(masterPath.length - 1, idx));
      return masterPath[idx];
    }

    function resetSnake() {
      buildMasterPath();
      if (masterPath.length === 0) return;
      snake = [];
      const start = Math.min(3, masterPath.length - 1);
      for (let i = 0; i <= start; i++) snake.push(pathPoint(start - i));
      headIdx = start;
      idleDir = 1;
      mode = "idle";
      pendingGrowth = 0;
      targetIdx = null;
      activeRange = null;
      clickedHrefs.clear();
    }

    function handleClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-snake-href]");
      if (!a || masterPath.length === 0) return;
      const href = a.dataset.snakeHref!;
      const range = itemRanges[href];
      if (!range) return;

      clickedHrefs.add(href);

      let best = range.start;
      let bestD = Infinity;
      for (let i = 0; i < range.len; i++) {
        const d = Math.abs(range.start + i - headIdx);
        if (d < bestD) {
          bestD = d;
          best = range.start + i;
        }
      }
      targetIdx = best;
      targetIsSingle = clickedHrefs.size === 1;
      mode = "approach";
    }

    function ensureSeg(i: number): HTMLDivElement {
      let el = segPool[i];
      if (!el) {
        el = document.createElement("div");
        el.style.position = "absolute";
        el.style.top = "0";
        el.style.left = "0";
        el.style.width = "6px";
        el.style.height = "6px";
        overlay!.appendChild(el);
        segPool[i] = el;
      }
      return el;
    }

    function render() {
      for (let i = 0; i < snake.length; i++) {
        const s = snake[i];
        const el = ensureSeg(i);
        el.style.transform = `translate(${s.x * CELL}px,${s.y * CELL}px)`;
        el.style.background = i === 0 ? "var(--snake-head)" : "var(--snake-body)";
        el.style.borderRadius = i === 0 ? "2px" : "1.5px";
        el.style.display = "block";
      }
      for (let i = snake.length; i < segPool.length; i++) {
        segPool[i].style.display = "none";
      }

      let fc: Point | null = null;
      if (mode === "border-loop" && activeRange) fc = pathPoint(activeRange.start + borderFoodLocal);
      else if (mode === "approach" && targetIdx !== null) fc = pathPoint(targetIdx);

      if (fc) {
        if (!ballEl) {
          ballEl = document.createElement("div");
          ballEl.style.position = "absolute";
          ballEl.style.top = "0";
          ballEl.style.left = "0";
          ballEl.style.width = "8px";
          ballEl.style.height = "8px";
          ballEl.style.marginTop = "-1px";
          ballEl.style.marginLeft = "-1px";
          ballEl.style.borderRadius = "50%";
          ballEl.style.background = "var(--snake-food)";
          ballEl.style.boxShadow = "0 0 0 3px var(--snake-food-glow)";
          overlay!.appendChild(ballEl);
        }
        ballEl.style.display = "block";
        ballEl.style.transform = `translate(${fc.x * CELL}px,${fc.y * CELL}px)`;
      } else if (ballEl) {
        ballEl.style.display = "none";
      }
    }

    function tick() {
      if (masterPath.length === 0) return;
      let point: Point;

      if (mode === "approach" && targetIdx !== null) {
        const step = targetIdx > headIdx ? 1 : targetIdx < headIdx ? -1 : 0;
        headIdx = Math.max(0, Math.min(masterPath.length - 1, headIdx + step));
        point = pathPoint(headIdx);
        snake.unshift(point);
        if (headIdx === targetIdx) {
          pendingGrowth += 1;
          let range: Range | null = null;
          for (const key in itemRanges) {
            const r = itemRanges[key];
            if (headIdx >= r.start && headIdx < r.start + r.len) {
              range = r;
              break;
            }
          }
          if (targetIsSingle && range) {
            activeRange = range;
            mode = "border-loop";
            borderFoodLocal = Math.floor(Math.random() * range.len);
          } else {
            mode = "idle";
            idleDir = step || 1;
          }
          targetIdx = null;
        }
        if (pendingGrowth > 0) pendingGrowth--;
        else snake.pop();
      } else if (mode === "border-loop" && activeRange) {
        let local = (headIdx - activeRange.start + activeRange.len) % activeRange.len;
        local = (local + 1) % activeRange.len;
        headIdx = activeRange.start + local;
        point = pathPoint(headIdx);
        snake.unshift(point);
        const maxLen = Math.min(activeRange.len - 2, 36);
        if (local === borderFoodLocal) {
          if (snake.length < maxLen) pendingGrowth += 1;
          borderFoodLocal = Math.floor(Math.random() * activeRange.len);
        }
        if (pendingGrowth > 0) pendingGrowth--;
        else snake.pop();
      } else {
        headIdx += idleDir;
        if (headIdx >= masterPath.length - 1) {
          headIdx = masterPath.length - 1;
          idleDir = -1;
        }
        if (headIdx <= 0) {
          headIdx = 0;
          idleDir = 1;
        }
        point = pathPoint(headIdx);
        snake.unshift(point);
        snake.pop();
      }

      render();
    }

    resetSnake();
    render();

    const interval = window.setInterval(tick, TICK_MS);
    container.addEventListener("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      resetSnake();
      render();
    });
    resizeObserver.observe(container);

    return () => {
      window.clearInterval(interval);
      container.removeEventListener("click", handleClick);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, hrefs.join("|")]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      style={
        {
          "--snake-body": "#1D9E75",
          "--snake-head": "#5DCAA5",
          "--snake-food": "#5DCAA5",
          "--snake-food-glow": "rgba(93, 202, 165, 0.18)",
        } as React.CSSProperties
      }
    />
  );
}
