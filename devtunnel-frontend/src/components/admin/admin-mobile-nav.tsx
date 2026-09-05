"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

/**
 * Narrow-viewport counterpart to `AdminSidebar` (hidden `md` and up). A
 * full-height sidebar doesn't fit a phone-width screen, so this renders
 * the same nav entries as a horizontally scrollable strip of pills
 * instead — same data source (`ADMIN_NAV_ITEMS`), same disabled/"Soon"
 * treatment for modules that aren't built yet.
 */
export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      className="flex gap-2 overflow-x-auto border-b border-border-subtle bg-bg px-4 py-2.5 md:hidden"
    >
      {ADMIN_NAV_ITEMS.map(({ href, label, Icon, built }) => {
        if (!built) {
          return (
            <span
              key={href}
              aria-disabled="true"
              title={`${label} isn't built yet`}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-[11px] text-text-faint"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          );
        }

        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
              isActive
                ? "border-accent text-text bg-surface-raised"
                : "border-border-subtle text-text-dim hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}