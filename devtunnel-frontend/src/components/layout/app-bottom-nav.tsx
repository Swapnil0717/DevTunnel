// devtunnel-frontend/src/components/layout/app-bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HomeIcon,
  FolderIcon,
  ChecklistIcon,
  ToolIcon,
  UserIcon,
  GridIcon,
  GitBranchIcon,
  IssueIcon,
  UploadIcon,
  SettingsIcon,
} from "./nav-icons";
import { useAuth } from "@/lib/auth/use-auth";
import { signInHref } from "@/lib/auth/sign-in-href";

/**
 * Fixed bottom tab bar, shown only below the `sm` breakpoint — the
 * mobile counterpart to `AppSidebar`. `AppSidebar` lists 9 items (Home,
 * Projects on Devtunnel, Open Source Tools on Devtunnel, Tasks / Issues,
 * All Issues, Github Projects, Github Open source tools, Community,
 * Profile, Settings); a phone-width tab bar can't hold all of them
 * legibly, so this keeps the 4 most-used, in the same relative order as
 * the sidebar, plus a 5th **More** tab.
 *
 * Every item the tab bar itself can't fit still needs to be reachable on
 * a phone — a sidebar-only link is invisible below `sm`, which otherwise
 * leaves Open Source Tools, All Issues, both Github-wide catalogs,
 * Community and Settings with no path in from anywhere in the app once
 * `AppSidebar` is hidden. `More` opens `MoreSheet`, a bottom-up panel
 * listing exactly those leftover items (same order the sidebar itself
 * uses for its "everything else" tail) rather than dropping them — a
 * shorter tab bar is fine, a shorter *site* on mobile is not.
 *
 * Signed-out visitors (the catalog pages are public) get a guest set
 * instead: Home and Profile both need an account, so they're swapped for
 * Tools and a "Sign in" tab — every tab a guest sees goes somewhere they
 * can actually open. Their `More` sheet drops Settings for the same
 * reason (it also needs an account) and Community stays, since browsing
 * `/submissions` doesn't.
 */
const NAV_LINKS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/projects", label: "Projects", Icon: FolderIcon },
  { href: "/tasks", label: "Tasks", Icon: ChecklistIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
] as const;

const GUEST_NAV_LINKS = [
  { href: "/projects", label: "Projects", Icon: FolderIcon },
  { href: "/opensource-tools", label: "Tools", Icon: ToolIcon },
  { href: "/tasks", label: "Tasks", Icon: ChecklistIcon },
  { href: "/login", label: "Sign in", Icon: UserIcon },
] as const;

const MORE_LINKS = [
  { href: "/opensource-tools", label: "Open Source Tools on Devtunnel", Icon: ToolIcon, requiresAccount: false },
  { href: "/issues", label: "All Issues", Icon: IssueIcon, requiresAccount: false },
  { href: "/github-projects", label: "Github Projects", Icon: GitBranchIcon, requiresAccount: false },
  { href: "/github-open-source-tools", label: "Github Open source tools", Icon: GridIcon, requiresAccount: false },
  { href: "/submissions", label: "Community", Icon: UploadIcon, requiresAccount: false },
  { href: "/settings", label: "Settings", Icon: SettingsIcon, requiresAccount: true },
] as const;

interface BottomNavItem {
  href: string;
  label: string;
  Icon: typeof HomeIcon;
}

function MoreSheet({
  open,
  onClose,
  links,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  links: readonly (typeof MORE_LINKS)[number][];
  pathname: string | null;
}) {
  // Lock body scroll while the sheet is open, same as any other bottom
  // sheet — otherwise the page behind it scrolls along with a touch drag.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 sm:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border-subtle bg-surface pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <nav aria-label="More">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 px-3 py-2">
            {links.map(({ href, label, Icon }) => {
              const isActive = pathname === href || pathname?.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-3 text-[14px] transition-colors ${
                      isActive ? "bg-surface-raised text-text" : "text-text-secondary hover:bg-surface-raised hover:text-text"
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
      </div>
    </div>
  );
}

export function AppBottomNav() {
  const pathname = usePathname();
  const { user, status } = useAuth();
  const isSignedOut = !user && status === "unauthenticated";
  const links: readonly BottomNavItem[] = isSignedOut ? GUEST_NAV_LINKS : NAV_LINKS;
  const moreLinks = isSignedOut ? MORE_LINKS.filter((link) => !link.requiresAccount) : MORE_LINKS;

  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = moreLinks.some(
    (link) => pathname === link.href || pathname?.startsWith(`${link.href}/`),
  );

  // A route change (tapping a link inside the sheet, or the browser
  // back/forward buttons) should always close the sheet rather than
  // leave it open over the newly-navigated page.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        links={moreLinks}
        pathname={pathname}
      />
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border-subtle bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {links.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href === "/login" ? signInHref(pathname) : href}
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

        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={isMoreActive && !moreOpen ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] ${
            moreOpen || isMoreActive ? "text-text" : "text-text-dim"
          }`}
        >
          <GridIcon className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
