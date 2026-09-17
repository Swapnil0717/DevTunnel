// devtunnel-frontend/src/components/layout/app-bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, FolderIcon, ChecklistIcon, UserIcon } from "./nav-icons";

/**
 * Fixed bottom tab bar, shown only below the `sm` breakpoint — the
 * mobile counterpart to `AppSidebar`. `AppSidebar` now lists 9 items
 * (Home, Github Open source tools, Github Projects, Open Source Tools on
 * Devtunnel, Projects on Devtunnel, Tasks / Issues, All Issues, Profile,
 * Settings); a phone-width tab bar can't hold all of them legibly, so
 * this keeps the 4 most-used, in the same relative order as the sidebar.
 *
 * "Community" (`/submissions`) is deliberately NOT here. It's a new
 * entry and a browsing destination rather than a daily one, and adding
 * a fifth tab would shrink every existing label below a legible size on
 * a narrow phone. The sidebar carries it, and the two lists were always
 * meant to diverge rather than mirror (see this file's note above).
 */
const NAV_LINKS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/projects", label: "Projects", Icon: FolderIcon },
  { href: "/tasks", label: "Tasks", Icon: ChecklistIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
] as const;

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border-subtle bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {NAV_LINKS.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
              isActive ? "text-text" : "text-text-dim"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}