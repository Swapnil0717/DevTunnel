"use client";

import { useState } from "react";
import { Logo } from "./logo";
import { BookIcon, BugIcon, ExternalLinkIcon, HeartIcon } from "./nav-icons";
import { GuideDialog } from "./guide-dialog";
import { BugReportDialog } from "./bug-report-dialog";
import { SPONSOR_URL } from "@/lib/config";

type OpenDialog = "guide" | "bug" | null;

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The top bar of the contributor app shell (`AppShell`): **Guide**, **Found a
 * bug** and **Sponsor us**, on the right of the content column. The sidebar
 * keeps all page navigation; this bar only holds these three actions.
 *
 *  - **Guide** and **Found a bug** open popups (`GuideDialog`,
 *    `BugReportDialog`) instead of navigating, so the visitor keeps their place.
 *  - **Sponsor us** is a plain link to the external payment page
 *    (`SPONSOR_URL`), opened in a new tab. DevTunnel takes no payment itself and
 *    never learns whether anyone paid. When `NEXT_PUBLIC_SPONSOR_URL` is unset
 *    (or isn't https) the button is not rendered rather than pointing nowhere.
 *
 * Shown to signed-out visitors too — none of the three needs an account.
 *
 * Below `sm` the labels collapse to icons (each keeps an `aria-label`) and the
 * logo appears at the left, because the sidebar that normally carries it is
 * hidden there. The bar is `sticky` inside the content column, so it scrolls
 * with the page area only and never overlaps the fixed sidebar (z-20 vs z-10).
 */
export function AppHeader() {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-subtle bg-bg px-4 py-2.5 sm:justify-end sm:px-6">
        <div className="sm:hidden">
          <Logo />
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </header>

      {openDialog === "guide" ? <GuideDialog onClose={() => setOpenDialog(null)} /> : null}
      {openDialog === "bug" ? <BugReportDialog onClose={() => setOpenDialog(null)} /> : null}
    </>
  );
}
