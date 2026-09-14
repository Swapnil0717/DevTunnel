"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";

/**
 * Root error boundary — catches any uncaught render/runtime exception in
 * `/`, `/login`, `/auth/callback`, and anywhere else outside the
 * `(protected)` and `admin/(protected)` groups (each of those has its own
 * `error.tsx` below, so this one never has to fake their shells).
 *
 * Every data fetcher in this app already degrades to an honest "not
 * available" state instead of throwing (see e.g. `profile/page.tsx`'s own
 * comment on that pattern) — so anything that lands here is a genuine bug,
 * not an expected failure. Before this file existed, that case fell
 * through to Next's bare default error screen with no branding and no way
 * back in.
 *
 * Must be a Client Component (Next.js requirement for `error.tsx`).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Logo />
      <div>
        <h1 className="m-0 mb-2 text-xl font-medium text-text">Something went wrong</h1>
        <p className="m-0 text-[14px] text-text-muted">
          An unexpected error occurred. You can try again, or head back to DevTunnel.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-text px-5 py-2.5 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised"
        >
          Back to DevTunnel
        </Link>
      </div>
    </main>
  );
}