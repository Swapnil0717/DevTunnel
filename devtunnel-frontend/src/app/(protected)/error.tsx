"use client";

import { useEffect } from "react";

/**
 * Error boundary for everything under `(protected)` — /home, /profile,
 * /settings, /onboarding. Renders inside `(protected)/layout.tsx`'s
 * `{children}` slot, so `AppSidebar`/`AppBottomNav` stay mounted and the
 * person never loses the app shell just because one page's content threw.
 *
 * Doesn't attempt its own "back to home" link — the sidebar/bottom nav
 * already sitting around this boundary covers that.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled error in protected route", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div>
        <h2 className="m-0 mb-1 text-[15px] font-medium text-text">This page hit a snag</h2>
        <p className="m-0 text-[13px] text-text-muted">
          Something went wrong loading this content.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center justify-center rounded-md bg-text px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}