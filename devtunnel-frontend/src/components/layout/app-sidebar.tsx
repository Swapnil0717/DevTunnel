"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "../auth/logout-button";
import { HomeIcon, FolderIcon, UserIcon, SettingsIcon } from "./nav-icons";
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
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="hidden w-[208px] shrink-0 flex-col border-r border-border-subtle px-4 py-6 sm:flex">
      <div className="mb-8 pl-1">
        <Logo />
      </div>

      <nav aria-label="Primary" className="flex-1">
        <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-surface-raised text-text"
                      : "text-text-dim hover:text-text hover:bg-surface"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border-subtle pt-4">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.name || user.username}'s avatar`}
            className="h-8 w-8 shrink-0 rounded-full"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-text-dim"
          >
            {(user?.name || user?.username || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <LogoutButton className="!px-2.5 !py-2 !text-xs w-full" />
      </div>
    </aside>
  );
}