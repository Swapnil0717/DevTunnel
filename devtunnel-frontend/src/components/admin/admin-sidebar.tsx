"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../layout/logo";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

/**
 * Left app-shell navigation for the Admin Portal (devtunnel_workflow.txt,
 * Module 31 — Admin Frontend Modules), visible from `md` and up.
 * `AdminMobileNav` is the narrow-viewport counterpart, same convention as
 * `AppSidebar` / `AppBottomNav` on the contributor side.
 *
 * Deliberately its own component rather than a reuse of `AppSidebar`:
 * that one's links (Home, Projects, Profile, Settings) are
 * contributor-facing and would be actively misleading inside the admin
 * portal. Only `Logo` is shared.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[224px] shrink-0 flex-col border-r border-border-subtle bg-bg px-4 py-6 md:flex">
      <div className="mb-1 pl-1">
        <Logo asLink={false} />
      </div>
      <p className="mb-7 pl-1 font-mono text-[11px] uppercase tracking-wide text-text-muted">
        Admin portal
      </p>

      <nav aria-label="Admin" className="flex-1">
        <ul className="flex flex-col gap-1 list-none p-0 m-0">
          {ADMIN_NAV_ITEMS.map(({ href, label, Icon, built }) => {
            if (!built) {
              return (
                <li key={href}>
                  <span
                    aria-disabled="true"
                    title={`${label} isn't built yet`}
                    className="flex cursor-not-allowed items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-text-faint"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {label}
                    </span>
                    <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-faint">
                      Soon
                    </span>
                  </span>
                </li>
              );
            }

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
    </aside>
  );
}