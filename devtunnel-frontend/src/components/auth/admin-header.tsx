"use client";


import { LogoutButton } from "../auth/logout-button";
import { useAuth } from "@/lib/auth/use-auth";
import { Logo } from "../layout/logo";

/**
 * Admin Portal shell header (devtunnel_workflow.txt, Module 31 — Admin
 * Frontend Modules).
 *
 * Deliberately its own component rather than a reuse of `AppSidebar` /
 * `AppHeader`: those are contributor-facing navigation (Home, Projects,
 * Profile, Settings) and would be actively misleading inside the admin
 * portal. Only `Logo` and `LogoutButton` are shared — everything else here
 * is admin-specific. `LogoutButton`'s `redirectTo="/admin/login"` keeps
 * sign-out from dropping an admin back on the contributor sign-in screen.
 */
export function AdminHeader() {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border-subtle bg-bg px-6 py-3">
      <div className="flex items-center gap-3">
        <Logo asLink={false} />
        <span
          aria-hidden="true"
          className="h-4 w-px bg-border"
        />
        <span className="font-mono text-[11px] uppercase tracking-wide text-text-muted">
          Admin
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <span className="text-xs text-text-dim">
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