import { FolderIcon } from "@/components/layout/nav-icons";

/**
 * Square placeholder logo for a card on `/projects` ("Projects on
 * Devtunnel"). `ProjectSummary` (`lib/home/types.ts`) has no image/logo
 * field — a curated DevTunnel project has no GitHub owner avatar to
 * borrow the way `RepoLogo` does (`repositoryFullName` isn't part of
 * this shape) and no source URL to derive a favicon from the way
 * `OpenSourceToolLogo` does — so there is no real image to fetch here at
 * all (Frontend_Development_Rules.txt rule 58: never fabricate a field
 * the backend doesn't have).
 *
 * Renders the same "always show something real" placeholder those two
 * components fall back to once every real image source has failed
 * (`avatar-placeholder-*` tokens, `rounded-[12px]` to match
 * `OpenSourceToolLogo`'s square treatment), with `FolderIcon` standing in
 * for the project the same way it already marks "Projects on Devtunnel"
 * in `AppSidebar`.
 */
export function DevtunnelProjectLogo({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[10px] border border-avatar-placeholder-border bg-avatar-placeholder-bg"
    >
      <FolderIcon className="h-1/2 w-1/2 text-avatar-placeholder-icon" />
    </span>
  );
}