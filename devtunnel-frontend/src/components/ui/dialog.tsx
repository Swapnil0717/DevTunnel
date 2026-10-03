"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/layout/nav-icons";

const SIZE_CLASS = {
  sm: "sm:max-w-[480px]",
  md: "sm:max-w-[600px]",
  lg: "sm:max-w-[940px]",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal popup with a title, an optional description and a close (X) button.
 *
 * Closing: the X button, the Esc key and a click on the dark backdrop all call
 * `onRequestClose`. The dialog never closes itself — the owner decides (the bug
 * form uses that to ask before throwing away what someone typed).
 *
 * Accessibility: `role="dialog"` + `aria-modal`, labelled by the title; focus
 * moves into the dialog on open, Tab stays inside it, and focus returns to
 * whatever opened it on close. The page behind doesn't scroll while it is open.
 *
 * Layout: a centered card from `sm` up; on a phone it is a full-width sheet
 * anchored to the bottom that scrolls inside itself. The overlay uses
 * `z-[70]`, above the fixed sidebar (z-20), the bottom nav and its More sheet.
 *
 * `size` sets the card's width from `sm` up: `sm` 480px (default), `md` 600px
 * (forms with chips and a few fields, like the bug report) or `lg` 940px
 * (content that needs room, like the Guide's two-page book). `icon` is an
 * optional tile drawn to the left of the title. Everything else is the same.
 */
export function Dialog({
  title,
  description,
  onRequestClose,
  size = "sm",
  icon,
  children,
}: {
  title: string;
  description?: string;
  onRequestClose: () => void;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the effects below on every render.
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (firstField ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] focus:outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-[12px] sm:pb-5 ${
          SIZE_CLASS[size]
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {icon ? <div className="shrink-0">{icon}</div> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[15px] font-medium text-text">
              {title}
            </h2>
            {description ? (
              <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => closeRef.current()}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-raised hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
