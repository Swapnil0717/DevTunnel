"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";

/** `YYYY-MM-DD` in the viewer's own time zone — what `<time datetime>` should say about "today". */
function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Top bar for the home screen: today's date on the left, the signed-in
 * person's name and avatar — a real link to `/profile` — on the right.
 * Distinct from the removed `AppHeader` (see (protected)/profile/page.tsx
 * comment): it does NOT repeat the Home/Projects/Profile links already in
 * `AppSidebar` and `AppBottomNav`, which would just be a duplicate nav
 * landmark.
 *
 * The date is set after mount, in the browser. Rendering it during the server
 * pass would print the *server's* day (the Worker's UTC clock), which is
 * wrong for anyone whose local date differs, and would trip a hydration
 * mismatch when the client then computed its own. The `<p>` keeps its line
 * height in the meantime so nothing shifts when the date appears.
 */
export function HomeHeader() {
  const { user, status } = useAuth();
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  const displayName = user?.name || user?.username;

  return (
    <header className="mb-7 flex items-center justify-between gap-4">
      <p className="m-0 min-h-[18px] flex-none whitespace-nowrap font-mono text-xs leading-[18px] text-text-dim">
        {today ? (
          <time dateTime={toLocalIsoDate(today)}>
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </time>
        ) : null}
      </p>

      {status !== "loading" && (
        <Link
          href="/profile"
          aria-label={`View profile: ${displayName || "your account"}`}
          className="flex min-w-0 items-center gap-2.5 rounded-full transition-opacity hover:opacity-80"
        >
          {displayName ? (
            <span className="max-w-[220px] truncate text-[12.5px] text-text-muted">
              {displayName}
            </span>
          ) : null}
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar, 30px
            <img
              src={user.avatarUrl}
              alt=""
              width={30}
              height={30}
              className="h-[30px] w-[30px] flex-none rounded-full border border-[#2A2A2A] bg-[#161616] object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-[#2A2A2A] bg-[#161616] text-xs text-[#C8C8C8]"
            >
              {(displayName || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
      )}
    </header>
  );
}
