// devtunnel-frontend/src/components/layout/app-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { LogoutButton } from "../auth/logout-button";
import { PortalSwitchLink } from "../auth/portal-switch-link";
import {
  HomeIcon,
  ToolIcon,
  GitBranchIcon,
  GridIcon,
  FolderIcon,
  ChecklistIcon,
  IssueIcon,
  UploadIcon,
  UserIcon,
  SettingsIcon,
} from "./nav-icons";
import { useAuth } from "@/lib/auth/use-auth";

/**
 * Left app-shell navigation for sm and up. Below sm, `AppBottomNav`
 * (a fixed bottom tab bar) takes over instead — a full-height sidebar
 * eats too much of a phone-width screen, and a bottom bar is the more
 * usual mobile pattern. `AppBottomNav` only surfaces a subset of these
 * (all 9 don't fit a phone-width tab bar), so keep the two lists in sync
 * deliberately rather than assuming they should always match.
 *
 * Order: Home, then DevTunnel's own curated lists (Projects on
 * Devtunnel, Open Source Tools on Devtunnel), then Tasks / Issues and
 * All Issues, then the two live GitHub-wide catalogs (Github Projects,
 * Github Open source tools — unfiltered GitHub search results,
 * src/routes/githubProjects.ts and githubOpenSourceTools.ts), then
 * Community, Profile and Settings. Community (`/submissions`) stays
 * after every catalog on purpose: it's the one list contributors fill
 * themselves, and grouping it with the curated or GitHub-wide catalogs
 * would blur exactly the distinction that page exists to make (see
 * `app/(protected)/submissions/page.tsx`).
 *
 * The sidebar is pinned to the viewport (`sticky top-0 h-screen`), so
 * only the page content scrolls; on a viewport too short to fit every
 * item the sidebar scrolls inside itself (`overflow-y-auto`) instead of
 * clipping the account/sign-out footer.
 */
const NAV_LINKS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/projects", label: "Projects on Devtunnel", Icon: FolderIcon },
  { href: "/opensource-tools", label: "Open Source Tools on Devtunnel", Icon: ToolIcon },
  { href: "/tasks", label: "Tasks / Issues", Icon: ChecklistIcon },
  { href: "/issues", label: "All Issues", Icon: IssueIcon },
  { href: "/github-projects", label: "Github Projects", Icon: GitBranchIcon },
  { href: "/github-open-source-tools", label: "Github Open source tools", Icon: GridIcon },
  { href: "/submissions", label: "Community", Icon: UploadIcon },
  { href: "/profile", label: "Profile", Icon: UserIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen w-[208px] shrink-0 flex-col self-start overflow-y-auto border-r border-border-subtle px-4 py-6 sm:flex">
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

      <PortalSwitchLink from="user" className="mb-2 w-full justify-center" />

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