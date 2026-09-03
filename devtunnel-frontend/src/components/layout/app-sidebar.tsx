"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "../auth/logout-button";
import { HomeIcon, FolderIcon, UserIcon } from "./nav-icons";
import { useAuth } from "@/lib/auth/use-auth";

/**
 * Left app-shell navigation for sm and up. Below sm, `AppBottomNav`
 * (a fixed bottom tab bar) takes over instead — a full-height sidebar
 * eats too much of a phone-width screen, and a bottom bar is the more
 * usual mobile pattern.
 */
const NAV_LINKS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/projects", label: "Projects", Icon: FolderIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="hidden w-[132px] shrink-0 flex-col border-r border-border-subtle px-3 py-4 sm:flex">
      <div className="mb-6 pl-1">
        <Logo />
      </div>

      <nav aria-label="Primary" className="flex-1">
        <ul className="flex flex-col gap-0.5 list-none p-0 m-0">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-md px-2 py-[7px] text-xs transition-colors ${
                    isActive
                      ? "bg-surface-raised text-text"
                      : "text-text-dim hover:text-text"
                  }`}
                >
                  <Icon className="h-[15px] w-[15px]" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.name || user.username}'s avatar`}
            className="h-6 w-6 shrink-0 rounded-full"
          />
        ) : null}
        <LogoutButton className="!px-2 !py-1.5 !text-[11px] w-full" />
      </div>
    </aside>
  );
}