"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth/use-auth";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "./logo";

/** Reads the shared authentication state to greet the signed-in user and
 * expose sign out — devtunnel_workflow.txt task: "Create user profile state". */
export function AppHeader() {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
      <Logo />
      <nav aria-label="Primary" className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-[13px] text-text-muted transition-colors hover:text-text"
        >
          Dashboard
        </Link>
        <Link
          href="/profile"
          className="text-[13px] text-text-muted transition-colors hover:text-text"
        >
          Profile
        </Link>
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt=""
            width={28}
            height={28}
            className="rounded-full border border-border"
          />
        ) : null}
        <LogoutButton />
      </nav>
    </header>
  );
}
