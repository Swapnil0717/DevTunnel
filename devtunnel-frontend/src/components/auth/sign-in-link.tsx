"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signInHref } from "@/lib/auth/sign-in-href";

type SignInLinkVariant = "primary" | "secondary" | "solid";

interface SignInLinkProps {
  children: ReactNode;
  /**
   * `primary` — the accent-coloured main action (matches "Contribute to
   * this project"). `secondary` — the bordered secondary action (matches
   * "Star"). `solid` — the high-contrast "Continue with GitHub" look the
   * login button and sidebar footer use.
   */
  variant?: SignInLinkVariant;
  icon?: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<SignInLinkVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-surface-raised",
  solid: "bg-text text-bg hover:opacity-90",
};

/**
 * What an action button (Star, Contribute, Upvote, Nominate, ...) turns
 * into for a signed-out visitor on a public page.
 *
 * It's a real `<a href="/login?next=...">` rather than a `<button>` with
 * an `onClick` that calls `router.push` — signing in is navigation, and
 * navigation must be a crawlable, keyboard-and-middle-click-friendly link
 * (Frontend_Development_Rules.txt rules 10 and 37). It replaces the
 * failure mode where a signed-out visitor clicked "Star" and got a
 * generic "Couldn't star this project right now" error from a request the
 * backend was always going to reject.
 */
export function SignInLink({
  children,
  variant = "secondary",
  icon,
  className = "",
}: SignInLinkProps) {
  const pathname = usePathname();

  return (
    <Link
      href={signInHref(pathname)}
      prefetch={false}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {icon}
      {children}
    </Link>
  );
}
