import Link from "next/link";
import { EditIcon, EyeIcon } from "@/components/layout/nav-icons";
import { OpenSourceToolLogo } from "./opensource-tool-logo";
import { DeleteOpenSourceToolButton } from "./delete-opensource-tool-button";
import type { AdminToolSummary } from "@/lib/admin/opensource-tools/types";

/**
 * One square box on the `/admin/opensource-tools` grid — logo, the
 * tool's name below it, then a row of View / Edit / Delete actions.
 * Clicking the logo or the name opens the tool (same detail page as
 * "View"), same "the primary click target opens the item" convention
 * `AdminProjectsTable`'s row-as-link would use if this were a table
 * instead of a card grid.
 *
 * - View → `/admin/opensource-tools/:id`
 * - Edit → `/admin/opensource-tools/:id?edit=1`, opening
 *   `EditOpenSourceToolDetailsPanel` straight into edit mode — same
 *   `?edit=1` convention `AdminProjectsTable`'s "Edit" action uses,
 *   since there's no separate `/admin/opensource-tools/:id/edit` route.
 * - Delete → `DeleteOpenSourceToolButton`, refreshing the grid in place.
 */
export function AdminOpenSourceToolCard({ tool }: { tool: AdminToolSummary }) {
  const detailHref = `/admin/opensource-tools/${tool.id}`;

  return (
    <div className="flex flex-col items-center rounded-[10px] border border-border bg-surface p-4 text-center transition-colors hover:border-border-subtle">
      <Link
        href={detailHref}
        className="flex flex-col items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <OpenSourceToolLogo name={tool.name} sourceUrl={tool.sourceUrl} size={56} />
        <span className="line-clamp-2 text-[13px] font-medium leading-tight text-text">
          {tool.name}
        </span>
      </Link>

      {tool.primaryLanguage ? (
        <span className="mt-1.5 rounded-full border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[10.5px] text-tag-tech-text">
          {tool.primaryLanguage}
        </span>
      ) : null}

      <div className="mt-3 flex w-full items-center justify-center gap-1 border-t border-border-subtle pt-2.5">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-text-secondary hover:text-accent"
        >
          <EyeIcon className="h-3 w-3 shrink-0" />
          View
        </Link>

        <Link
          href={`${detailHref}?edit=1`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-text-secondary hover:text-accent"
        >
          <EditIcon className="h-3 w-3 shrink-0" />
          Edit
        </Link>

        <DeleteOpenSourceToolButton toolId={tool.id} toolName={tool.name} />
      </div>
    </div>
  );
}