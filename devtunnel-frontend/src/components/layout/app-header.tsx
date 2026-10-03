"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { BookIcon, BugIcon, ExternalLinkIcon, HeartIcon } from "./nav-icons";
import { GuideDialog } from "./guide-dialog";
import { BugReportDialog } from "./bug-report-dialog";
import { SPONSOR_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/use-auth";

type OpenDialog = "guide" | "bug" | null;

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** `YYYY-MM-DD` in the viewer's own time zone — what `<time datetime>` should say about "today". */
function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Today's day and date ("Saturday, October 3") on the left of the bar.
 *
 * Set after mount, in the browser: rendering it on the server would print the
 * Worker's UTC day, which is wrong for anyone whose local date differs, and
 * would trip a hydration mismatch when the client computed its own. The `<p>`
 * keeps its line height meanwhile so nothing shifts when the date appears. It
 * re-reads the clock when the tab becomes visible again, so a tab left open
 * overnight doesn't keep yesterday's date.
 */
function HeaderDate() {
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
    function refresh() {
      if (document.visibilityState === "visible") setToday(new Date());
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  return (
    <p className="m-0 hidden min-h-[22px] whitespace-nowrap font-mono text-[13px] leading-[22px] text-text-dim sm:block">
      {today ? (
        <time suppressHydrationWarning dateTime={toLocalIsoDate(today)}>
          {today.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </time>
      ) : null}
    </p>
  );
}

/**
 * The signed-in person's name and avatar — a real link to `/profile` — in the
 * top-right corner. Signed-out visitors get nothing here (the sidebar already
 * carries "Sign in with GitHub"). While the session is still being resolved a
 * quiet circle holds the avatar's place so the buttons beside it don't jump.
 * The name is dropped below `sm`, where only the avatar fits.
 */
function HeaderProfile() {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <span
        aria-hidden="true"
        className="ml-1 h-9 w-9 flex-none rounded-full bg-surface-raised motion-safe:animate-pulse"
      />
    );
  }
  if (!user) return null;

  const displayName = user.name || user.username;

  return (
    <Link
      href="/profile"
      aria-label={`View profile: ${displayName || "your account"}`}
      className="ml-1 flex min-w-0 items-center gap-3 rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {displayName ? (
        <span className="hidden max-w-[220px] truncate text-[13px] text-text-muted sm:inline">
          {displayName}
        </span>
      ) : null}
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar, 36px
        <img
          src={user.avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 flex-none rounded-full border border-[#2A2A2A] bg-[#161616] object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#2A2A2A] bg-[#161616] text-sm text-[#C8C8C8]"
        >
          {(displayName || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </Link>
  );
}

/**
 * The top bar of the contributor app shell (`AppShell`). Left: today's day and
 * date. Right: **Guide**, **Found a bug**, **Sponsor us**, then — when signed
 * in — the person's name and avatar linking to `/profile`. The sidebar keeps
 * all page navigation; this bar holds those actions plus the date and the
 * profile corner (they used to sit at the top of Home only).
 *
 *  - **Guide** (a book) and **Found a bug** open popups (`GuideDialog`,
 *    `BugReportDialog`) instead of navigating, so the visitor keeps their place.
 *  - **Sponsor us** is a plain link to the external payment page
 *    (`SPONSOR_URL`), opened in a new tab. DevTunnel takes no payment itself and
 *    never learns whether anyone paid. When `NEXT_PUBLIC_SPONSOR_URL` is unset
 *    (or isn't https) the button is not rendered rather than pointing nowhere.
 *
 * **Guide** is only offered to a signed-in person: it is written for them
 * (their tasks, profile and the CLI). **Found a bug** and **Sponsor us** need
 * no account, so signed-out visitors still get those two.
 *
 * The bar is 64px tall on a phone and 80px from `sm` up (it was about 56px).
 * The buttons stay compact — 12.5px labels, 16px icons — to match the
 * sidebar's type scale, and the avatar is 36px. `min-h` rather than `h` so a
 * larger system font can still grow the bar.
 *
 * Below `sm` the labels collapse to icons (each keeps an `aria-label`), the
 * date and the name are dropped (only the avatar stays), and the logo appears
 * at the left, because the sidebar that normally carries it is hidden there.
 * The bar is `sticky` inside the content column, so it scrolls
 * with the page area only and never overlaps the fixed sidebar (z-20 vs z-10).
 */
export function AppHeader() {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const { user } = useAuth();

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-[64px] items-center justify-between gap-3 border-b border-border-subtle bg-bg px-4 py-3 sm:min-h-[80px] sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center">
          <div className="sm:hidden">
            <Logo />
          </div>
          <HeaderDate />
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <button
              type="button"
              onClick={() => setOpenDialog("guide")}
              aria-haspopup="dialog"
              aria-label="Guide"
              className={BUTTON}
            >
              <BookIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Guide</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setOpenDialog("bug")}
            aria-haspopup="dialog"
            aria-label="Found a bug"
            className={BUTTON}
          >
            <BugIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Found a bug</span>
          </button>

          {SPONSOR_URL ? (
            <a
              href={SPONSOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sponsor us (opens in a new tab)"
              className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <HeartIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Sponsor us</span>
              <ExternalLinkIcon className="hidden h-3 w-3 shrink-0 sm:block" />
            </a>
          ) : null}

          <HeaderProfile />
        </div>
      </header>

      {openDialog === "guide" && user ? <GuideDialog onClose={() => setOpenDialog(null)} /> : null}
      {openDialog === "bug" ? <BugReportDialog onClose={() => setOpenDialog(null)} /> : null}
    </>
  );
}
