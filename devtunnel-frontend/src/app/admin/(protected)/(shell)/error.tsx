"use client";

import { useEffect } from "react";

/**
 * Error boundary for every admin shell page — dashboard, projects, tasks,
 * opensource-tools, activity, AI discovery. Renders inside
 * `(shell)/layout.tsx`'s `{children}` slot, one level *below* the admin
 * shell, so `AdminSidebar`/`AdminHeader`/`AdminMobileNav` stay mounted
 * instead of an admin losing the whole portal chrome over one broken page
 * — same reasoning as the contributor `(shell)/error.tsx`, kept as a
 * separate file because the two shells (and their nav) are completely
 * different components. The three full-bleed wizards
 * (`projects/new`, `tasks/new`, `opensource-tools/new`) aren't in this
 * group and have no error boundary of their own, so an error there falls
 * back to the plain `admin/(protected)/error.tsx` one level up.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled error in admin route", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div>
        <h2 className="m-0 mb-1 text-[15px] font-medium text-text">This page hit a snag</h2>
        <p className="m-0 text-[13px] text-text-muted">
          Something went wrong loading this content. This has been logged.
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