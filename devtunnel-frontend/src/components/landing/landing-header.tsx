"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/submissions", label: "Community" },
] as const;

/**
 * Landing header: the real DevTunnel logo on the left, a white pill of
 * primary links, and a dark "Sign in" pill. Under 720px the pill collapses
 * into a menu button that opens a white sheet. Every item is a real link, so
 * crawlers and no-JS visitors still reach the whole catalog.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 720) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <header className="lp-hdr">
        <Link href="/" aria-label="DevTunnel home" className="lp-logo">
          <Image
            src="/logo.png"
            alt="DevTunnel"
            width={1643}
            height={262}
            priority
          />
        </Link>

        <nav className="lp-navpill" aria-label="Primary">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={href === "/" ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Link href="/login" className="lp-signin lp-signin-desktop">
          Sign in
        </Link>

        <button
          type="button"
          className="lp-burger"
          aria-expanded={open}
          aria-controls="lp-sheet"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <i />
          <i />
          <i />
        </button>
      </header>

      {open ? (
        <>
          <div className="lp-scrim" onClick={() => setOpen(false)} />
          <nav
            id="lp-sheet"
            className="lp-sheet"
            aria-label="Mobile"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={href === "/" ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
            <Link href="/login" className="lp-signin">
              Sign in
            </Link>
          </nav>
        </>
      ) : null}
    </>
  );
}
