"use client";

import { useEffect, useRef } from "react";

/**
 * Looping, muted background video for the hero. It plays only while it is on
 * screen, and stays on the poster frame for visitors who prefer reduced
 * motion. Files: `public/hero-bg-bw.webm` and `public/hero-poster.jpg`.
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

    video.addEventListener("loadeddata", start);
    video.addEventListener("canplay", start);

    let observer: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) start();
          else video.pause();
        },
        { threshold: 0 },
      );
      observer.observe(video);
    }

    return () => {
      video.removeEventListener("loadeddata", start);
      video.removeEventListener("canplay", start);
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
      <source src="/hero-bg-bw.webm" type="video/webm" />
    </video>
  );
}
