"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "../auth/logout-button";
import { useAuth } from "@/lib/auth/use-auth";

const NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/profile", label: "Profile" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border-subtle bg-bg px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/home" aria-label="DevTunnel home">
          <Logo />
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-1 list-none p-0 m-0">
            {NAV_LINKS.map((link) => {
              const isActive =
                pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-block rounded-md px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "bg-surface text-text"
                        : "text-text-dim hover:text-text"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.name || user.username}'s avatar`}
            className="h-7 w-7 rounded-full"
          />
        ) : null}
        <LogoutButton />
      </div>
    </header>
  );
}
