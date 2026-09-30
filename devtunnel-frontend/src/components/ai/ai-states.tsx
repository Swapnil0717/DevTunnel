// devtunnel-frontend/src/components/ai/ai-states.tsx
"use client";

import type { ReactNode } from "react";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { SignInLink } from "@/components/auth/sign-in-link";
import { AiBadge } from "@/components/ai/ai-badge";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/**
 * The shared pieces of every AI feature's UI (Part 7 unification).
 *
 * WHY: the summary card, the issue-explanation card, the issue-insights card
 * and the AI search bar each hand-copied the same loading / signed-out /
 * "AI is off" / error-with-retry markup, and the copies had already started to
 * drift (different spacing, different retry button classes). Keeping ONE
 * version means the Part 1 rule-10 states — loading (`role="status"`),
 * error-with-retry (`role="alert"`), disabled and signed-out — behave and read
 * the same everywhere, and a future AI feature gets them by composing these.
 *
 * Feature-specific wording stays with the feature: every component takes its
 * text as a prop.
 */

/** Secondary button used for "Try again", "Clear AI search", "Analyze issues", … */
export const AI_SECONDARY_BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Card title row: sparkle icon + small-caps title on the left, the
 * "AI-generated" badge on the right once there is AI content to label
 * (`done`). `level` lets each card keep the heading level that fits its place
 * in the page's outline.
 */
export function AiCardHeader({ title, level, done }: { title: string; level: "h2" | "h3" | "h4"; done: boolean }) {
  const Heading = level;
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <Heading className="m-0 inline-flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-text-faint">
        <SparkleIcon className="h-3.5 w-3.5" />
        {title}
      </Heading>
      {done ? <AiBadge /> : null}
    </div>
  );
}

/**
 * Loading state: `role="status"` + `aria-live="polite"`, a spinner and a
 * message. Pass `skeletonLines` inside a card to reserve the height of the
 * content that is about to appear; leave it out for the compact inline form
 * (the search bar).
 */
export function AiLoading({
  message,
  skeletonLines,
  className,
}: {
  message: string;
  skeletonLines?: number;
  className?: string;
}) {
  if (skeletonLines) {
    return (
      <div role="status" aria-live="polite" className={className}>
        <div className="mb-3 flex items-center gap-2 text-[12px] text-text-dim">
          <Spinner size={13} />
          <span>{message}</span>
        </div>
        <SkeletonLines count={skeletonLines} />
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2 text-[12px] text-text-dim ${className ?? ""}`}>
      <Spinner size={13} />
      <span>{message}</span>
    </div>
  );
}

/** Signed-out state: what the AI feature would do, plus a sign-in button. The AI endpoints are signed-in only. */
export function AiSignInPrompt({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 text-[12.5px] text-text-muted">{message}</p>
      <SignInLink variant="secondary" icon={<SparkleIcon className="h-3.5 w-3.5 shrink-0" />}>
        Sign in to use AI
      </SignInLink>
    </div>
  );
}

/**
 * One-line informational state with nothing to click: "AI is turned off",
 * "not enough content", "issue closed", …. `role="status"`, not an alert —
 * these are expected outcomes, not failures.
 */
export function AiNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="m-0 text-[12.5px] text-text-muted">
      {children}
    </p>
  );
}

/**
 * Failure state: `role="alert"` message plus a "Try again" button. Omit
 * `onRetry` for permanent failures where asking again can't help (the card
 * decides which codes those are).
 */
export function AiError({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className ?? ""}`}>
      <p role="alert" className="m-0 text-[12px] text-status-error-label">
        {message}
      </p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={AI_SECONDARY_BUTTON_CLASS}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
