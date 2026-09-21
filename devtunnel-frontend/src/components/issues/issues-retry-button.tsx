"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Try again" for the All Issues page's failure state. `/issues` is
 * rendered on the server, so a retry has to re-run that render —
 * `router.refresh()` re-fetches the route's server data without a full
 * page reload, and `useTransition` keeps the button disabled (with a
 * spinner) until the new result arrives, so a double click can't fire
 * two requests at a backend that's already struggling.
 */
export function IssuesRetryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? <Spinner size={13} /> : null}
      {isPending ? "Trying again…" : "Try again"}
    </button>
  );
}
