import type { ComponentType } from "react";
import {
  GridIcon,
  FolderIcon,
  PlusIcon,
  UserIcon,
  GitBranchIcon,
  FileIcon,
  ChecklistIcon,
  EyeIcon,
  UploadIcon,
  RefreshIcon,
  ActivityIcon,
} from "@/components/layout/nav-icons";

export interface AdminNavItem {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /**
   * Whether this section's page actually exists yet. Every module from
   * devtunnel_workflow.txt's "Admin Frontend Modules" list (A2–A12) is
   * listed here so the full shape of the Admin Portal is visible in the
   * nav, but only Module A2 (Dashboard) has a real route today.
   *
   * `AdminSidebar` / `AdminMobileNav` render `built: false` entries as
   * disabled, non-navigating labels rather than `<Link>`s to pages that
   * don't exist — Frontend_Development_Rules.txt rule 11 ("do not create
   * orphan public pages") and rule 56 ("do not break existing public
   * URLs") both point the same direction for a private portal too: don't
   * ship a link nobody can actually follow. Flip this to `true` in the
   * same commit that adds the page for that module.
   */
  built: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: GridIcon, built: true },
  { href: "/admin/projects", label: "Projects", Icon: FolderIcon, built: false },
  { href: "/admin/projects/new", label: "Add project", Icon: PlusIcon, built: false },
  { href: "/admin/authors", label: "Authors", Icon: UserIcon, built: false },
  {
    href: "/admin/repositories",
    label: "Repository details",
    Icon: GitBranchIcon,
    built: false,
  },
  { href: "/admin/files", label: "Project files", Icon: FileIcon, built: false },
  { href: "/admin/tasks", label: "Tasks", Icon: ChecklistIcon, built: false },
  { href: "/admin/preview", label: "Project preview", Icon: EyeIcon, built: false },
  { href: "/admin/publish", label: "Publish", Icon: UploadIcon, built: false },
  { href: "/admin/github-sync", label: "GitHub sync", Icon: RefreshIcon, built: false },
  { href: "/admin/activity", label: "Activity", Icon: ActivityIcon, built: false },
];

/**
 * Resolves the nav entry (if any) whose route the given pathname is
 * currently inside. Shared by `AdminHeader` (page title), `AdminSidebar`,
 * and `AdminMobileNav` (active-state highlighting) so "what counts as
 * being on this section" is defined exactly once.
 */
export function findActiveAdminNavItem(pathname: string | null): AdminNavItem | undefined {
  if (!pathname) return undefined;
  return ADMIN_NAV_ITEMS.find(
    (item) => item.built && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
}