"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/auth-context";
import { LogoutButton } from "@/components/auth/logout-button";

/** Checklist: "Create user profile state" (surfaced here) + logout. */
export function DashboardHeader() {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
      <Link href="/">
        <Image
          src="/logo.png"
          alt="DevTunnel"
          width={142}
          height={22}
          className="h-[22px] w-auto"
        />
      </Link>

      {user && (
        <div className="flex items-center gap-3">
          <a
            href={user.githubProfileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-[13px] text-ink-secondary hover:text-ink-primary"
          >
            <Image
              src={user.avatarUrl}
              alt=""
              width={24}
              height={24}
              className="rounded-full"
            />
            <span>{user.displayName}</span>
          </a>
          <LogoutButton />
        </div>
      )}
    </header>
  );
}
