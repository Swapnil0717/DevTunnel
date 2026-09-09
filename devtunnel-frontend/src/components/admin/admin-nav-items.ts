import type { ComponentType } from "react";
import {
  GridIcon,
  FolderIcon,
  PlusIcon,
  ChecklistIcon,
  IssueIcon,
  ActivityIcon,
} from "@/components/layout/nav-icons";

/** A single navigable admin route — the leaf nodes of `ADMIN_NAV_ITEMS`. */
export interface AdminNavLink {
  type: "link";
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /**
   * Whether this route actually exists yet. Every route from the Admin
   * Portal Master Coding Specification's navigation (section 2) and final
   * page list (section 29) is listed here so the full shape of the Admin
   * Portal is visible in the nav, but only Dashboard (`/admin`), All
   * Projects (`/admin/projects`), Project Onboarding
   * (`/admin/projects/new`), All Tasks (`/admin/tasks`), Create Task
   * (`/admin/tasks/new`), New Issues (`/admin/tasks/new-issues`), and
   * its Since Onboarding filter
   * (`/admin/tasks/new-issues/since-onboarding`) have real pages today.
   *
   * `AdminSidebar` / `AdminMobileNav` render `built: false` entries as
   * disabled, non-navigating labels rather than `<Link>`s to pages that
   * don't exist — Frontend_Development_Rules.txt rule 11 ("do not create
   * orphan public pages") and rule 56 ("do not break existing public
   * URLs") both point the same direction for a private portal too: don't
   * ship a link nobody can actually follow. Flip this to `true` in the
   * same commit that adds the page for that route.
   */
  built: boolean;
}

/**
 * A non-navigating section header with its own sub-routes — "Projects" and
 * "Tasks" in the spec's sidebar tree. Renders as a label followed by its
 * indented `items`, never as a link itself.
 */
export interface AdminNavGroup {
  type: "group";
  label: string;
  Icon: ComponentType<{ className?: string }>;
  items: AdminNavLink[];
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

/**
 * Admin sidebar structure, matching the Admin Portal Master Coding
 * Specification, section 2 — Admin Navigation, exactly:
 *
 * ```text
 * ADMIN
 * │
 * ├── Dashboard
 * │
 * ├── Projects
 * │   ├── All Projects
 * │   └── Project Onboarding
 * │
 * ├── Tasks
 * │   ├── All Tasks
 * │   ├── Create Task
 * │   ├── New Issues
 * │   └── New Issues ▸ Since Onboarding
 * │
 * └── Activity
 * ```
 *
 * "No additional sections unless required by the existing source code" —
 * so items the previous nav carried (Authors, Repository details, Project
 * files, Project preview, Publish, GitHub sync) are intentionally dropped
 * from this top-level list. They're still real workflow steps (project
 * repository/contributors live under Project Details, publishing happens
 * at the end of Project Onboarding, etc.) — they just aren't their own
 * sidebar entries per the spec.
 *
 * Routes are taken from the spec's section 29 final page list:
 * Projects → `/admin/projects` (A3) and `/admin/projects/new` (A4, the
 * onboarding wizard's first step); Tasks → `/admin/tasks` (A12),
 * `/admin/tasks/new` (A13, the onboarding wizard's first step), and
 * `/admin/tasks/new-issues` (A15); Activity → `/admin/activity` (A16).
 *
 * `/admin/tasks/new-issues/since-onboarding` isn't in the spec's page
 * list — it's a frontend-only filtered view nested under New Issues
 * (see `lib/admin/new-issues/since-onboarding.ts`), not a new top-level
 * page, so it's a sub-item of New Issues here rather than its own Tasks
 * entry.
 */
export const ADMIN_NAV_ITEMS: AdminNavEntry[] = [
  { type: "link", href: "/admin", label: "Dashboard", Icon: GridIcon, built: true },
  {
    type: "group",
    label: "Projects",
    Icon: FolderIcon,
    items: [
      {
        type: "link",
        href: "/admin/projects",
        label: "All Projects",
        Icon: FolderIcon,
        built: true,
      },
      {
        type: "link",
        href: "/admin/projects/new",
        label: "Project Onboarding",
        Icon: PlusIcon,
        built: true,
      },
    ],
  },
  {
    type: "group",
    label: "Tasks",
    Icon: ChecklistIcon,
    items: [
      {
        type: "link",
        href: "/admin/tasks",
        label: "All Tasks",
        Icon: ChecklistIcon,
        built: true,
      },
      {
        type: "link",
        href: "/admin/tasks/new",
        label: "Create Task",
        Icon: PlusIcon,
        built: true,
      },
      {
        type: "link",
        href: "/admin/tasks/new-issues",
        label: "All Issue",
        Icon: IssueIcon,
        built: true,
      },
      {
        type: "link",
        href: "/admin/tasks/new-issues/since-onboarding",
        label: "Since Onboarding",
        Icon: IssueIcon,
        built: true,
      },
    ],
  },
  { type: "link", href: "/admin/activity", label: "Activity", Icon: ActivityIcon, built: false },
];

/**
 * Flat list of every navigable leaf (groups expanded into their `items`),
 * in sidebar order. `AdminMobileNav`'s horizontally scrollable pill strip
 * has no room for a nested tree, so it renders this flat sequence instead;
 * `findActiveAdminNavItem` below searches it for the same reason.
 */
export const ADMIN_NAV_LINKS: AdminNavLink[] = ADMIN_NAV_ITEMS.flatMap((entry) =>
  entry.type === "group" ? entry.items : [entry],
);

/**
 * Resolves the nav entry (if any) whose route the given pathname is
 * currently inside. Shared by `AdminHeader` (page title),
 * `AdminSidebar`, and `AdminMobileNav` (active-state highlighting) so
 * "what counts as being on this section" is defined exactly once.
 *
 * Picks the *longest* matching `href` rather than the first one found:
 * since `/admin/tasks/new-issues/since-onboarding` (Since Onboarding)
 * starts with `/admin/tasks/new-issues` (New Issues), both would match
 * a naive first-match search on that URL, and array order would
 * silently decide which nav item lit up. Preferring the longest match
 * keeps a nested route's own, more specific link highlighted instead of
 * its parent — the same behavior most routers give "active" nav state
 * for nested paths.
 */
export function findActiveAdminNavItem(pathname: string | null): AdminNavLink | undefined {
  if (!pathname) return undefined;

  const matches = ADMIN_NAV_LINKS.filter(
    (item) => item.built && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );

  if (matches.length === 0) return undefined;

  return matches.reduce((longest, item) => (item.href.length > longest.href.length ? item : longest));
}