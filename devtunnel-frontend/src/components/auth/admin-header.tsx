"use client";

import { usePathname } from "next/navigation";
import { LogoutButton } from "../auth/logout-button";
import { useAuth } from "@/lib/auth/use-auth";
import { Logo } from "../layout/logo";
import { findActiveAdminNavItem } from "../admin/admin-nav-items";

/**
 * Admin Portal shell top bar (devtunnel_workflow.txt, Module 31 — Admin
 * Frontend Modules), paired with `AdminSidebar` / `AdminMobileNav`.
 *
 * The brand mark and section nav now live in `AdminSidebar`, so this only
 * shows: a small logo (mobile only, since the sidebar is hidden below
 * `md` and someone needs a "you're in the right app" cue there) + the
 * current section's label, and the signed-in admin's identity + sign-out.
 *
 * The section label is intentionally a `<p>`, not an `<h1>` — each admin
 * page already renders its own single `<h1>` (Frontend_Development_Rules.txt
 * rule 5: exactly one primary H1 per page), and this header is shared
 * chrome sitting outside that page's `<main>`, not the page heading itself.
 */
export function AdminHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  const activeItem = findActiveAdminNavItem(pathname);

  return (
    <header className="flex items-center justify-between border-b border-border-subtle bg-bg px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Logo asLink={false} className="h-5" />
        </div>
        <span
          aria-hidden="true"
          className="hidden h-4 w-px bg-border md:inline-block"
        />
        <p className="m-0 text-sm font-medium text-text">
          {activeItem?.label ?? "Admin"}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <span className="hidden text-xs text-text-dim sm:inline">
            {user.name || user.username}
          </span>
        ) : null}
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.name || user.username}'s avatar`}
            className="h-7 w-7 rounded-full"
          />
        ) : null}
        <LogoutButton redirectTo="/admin/login" />
      </div>
    </header>
  );
}