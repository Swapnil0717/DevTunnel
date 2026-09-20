"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signInHref } from "@/lib/auth/sign-in-href";

/**
 * Slim banner shown above every public page to a signed-out visitor.
 *
 * Public pages are readable without an account, but the personal actions
 * on them — starring, joining a project, upvoting, tracking progress —
 * are tied to a GitHub identity. Saying so once, at the top, means each
 * of those controls can stay a plain "Sign in to ..." link instead of
 * every page re-explaining why a button behaves differently for guests.
 *
 * A real `<a>` to `/login?next=<this page>` so signing in returns the
 * visitor to what they were reading (rules 10 and 37).
 */
export function GuestNotice() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Guest notice"
      className="border-b border-border-subtle bg-surface px-6 py-2.5 text-[12.5px] text-text-muted"
    >
      You&apos;re browsing DevTunnel as a guest. Sign in with GitHub to star, join projects,
      upvote and track your contributions.{" "}
      <Link
        href={signInHref(pathname)}
        prefetch={false}
        className="font-medium text-text underline-offset-2 hover:text-accent hover:underline"
      >
        Sign in with GitHub
      </Link>
    </aside>
  );
}
