"use client";

import { useEffect, useRef } from "react";

/**
 * Looping, muted background video for the hero. It plays only while it is on
 * screen, and stays on the poster frame for visitors who prefer reduced
 * motion. Files: `public/hero-bg-bw.mp4` and `public/hero-poster.jpg`.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // React sets `muted` as a property only; autoplay needs it before play().
    video.muted = true;

    const start = () => {
      if (reduce) {
        video.pause();
        return;
      }
      video.play().catch(() => {
        // Autoplay can be refused (data saver, low power). The poster stays.
      });
    };

    // Native `loop` can silently stop at the end of the file (some browsers
    // drop out of playback when they stall). Restart by hand whenever that happens.
    let visible = true;
    const restart = () => {
      if (reduce) return;
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    const resumeIfStopped = () => {
      // Only resume when something other than us paused it while it is on
      // screen and the tab is in front (the browser pauses hidden tabs itself).
      if (!reduce && visible && !document.hidden && !video.ended) start();
    };
    const onVisibility = () => {
      if (!document.hidden) resumeIfStopped();
    };

    video.addEventListener("loadeddata", start);
    video.addEventListener("canplay", start);
    video.addEventListener("ended", restart);
    video.addEventListener("pause", resumeIfStopped);
    video.addEventListener("stalled", resumeIfStopped);
    video.addEventListener("waiting", resumeIfStopped);
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          visible = Boolean(entries[0]?.isIntersecting);
          if (visible) start();
          else video.pause();
        },
        { threshold: 0 },
      );
      observer.observe(video);
    }

    return () => {
      video.removeEventListener("loadeddata", start);
      video.removeEventListener("canplay", start);
      video.removeEventListener("ended", restart);
      video.removeEventListener("pause", resumeIfStopped);
      video.removeEventListener("stalled", resumeIfStopped);
      video.removeEventListener("waiting", resumeIfStopped);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  return (
    <video
      ref={ref}
      className="h-vid"
      poster="/hero-poster.jpg"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
    >
      <source src="/hero-bg-bw.mp4" type="video/mp4" />
    </video>
  );
}
