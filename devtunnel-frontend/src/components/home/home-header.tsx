"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/use-auth";

/**
 * Top header for the home screen. Distinct from the removed
 * `AppHeader` (see (protected)/profile/page.tsx comment) — this does
 * NOT repeat the Home/Projects/Profile links already in `AppSidebar`
 * and `AppBottomNav`, which would just be a duplicate nav landmark.
 * It only surfaces the signed-in person's profile picture as a real
 * link to `/profile`, alongside the current date.
 */
export function HomeHeader() {
  const { user, status } = useAuth();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="mb-5 flex items-center justify-between">
      <p className="m-0 text-xs text-text-muted">
        <time dateTime={new Date().toISOString().slice(0, 10)}>{today}</time>
      </p>

      {status !== "loading" && (
        <Link
          href="/profile"
          aria-label={`View profile: ${user?.name || user?.username || "your account"}`}
          className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="hidden text-xs text-text-dim sm:inline">
            {user?.name || user?.username}
          </span>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-border-subtle"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-xs font-medium text-text-dim"
            >
              {(user?.name || user?.username || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
      )}
    </header>
  );
}