// src/components/ui/blueprint-issues.tsx
/**
 * Blueprint skeletons for the issue list pages, built as twins of the real
 * markup rather than generic bars:
 *
 *  - `/admin/tasks/new-issues` and `/admin/tasks/new-issues/since-onboarding`
 *    -> `BlueprintAdminIssuesPage` (header with its two action buttons,
 *    filter stack, a real `<table>` with the real headings / min-width /
 *    cell padding, pagination footer);
 *  - `/issues` -> `BlueprintIssueListBar`, a corrected twin of
 *    `LoadIssueListBar` (the old one drew a truncated sentence with the
 *    wrong count, so it never wrapped where the real line does).
 *
 * Same approach as `blueprint-wizard.tsx`: reuse the real class strings,
 * ghost the real copy (invisible text + hatched bar) so wrapping and line
 * boxes come from the browser, and never invent a fixed bar height where
 * a text line sits.
 */

import type { ReactNode } from "react";
import {
  BlueprintFill,
  BlueprintGhostParagraph,
  BlueprintGhostText,
  BlueprintListPagination,
  BlueprintPublicFilterBar,
} from "@/components/ui/blueprint-kit";

/** `lib/issues/api.ts` `ISSUES_PREVIEW_LIMIT` — the count in the real "Showing the N most recently updated…" line. */
const ISSUES_PREVIEW_LIMIT = 200;

/**
 * `LoadIssueListBar`'s idle state: `mb-3 flex flex-wrap items-center
 * justify-between gap-x-3 gap-y-2`, the full 12px sentence (a wrapping
 * `<p>`, ghosted as a paragraph so it wraps beside the button exactly as
 * the real one) and the 32px "Load all issues" button.
 */
export function BlueprintIssueListBar() {
  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      aria-hidden="true"
    >
      <BlueprintGhostParagraph
        text={`Showing the ${ISSUES_PREVIEW_LIMIT} most recently updated open issues — search and filters only cover what's loaded.`}
        className="m-0 text-[12px]"
      />
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-blueprint/25 bg-blueprint/[0.05] px-3 py-1.5 text-[12px] font-medium">
        <BlueprintGhostText text="Load all issues" />
      </span>
    </div>
  );
}

const TABLE_CELL = "px-4 py-3 align-top";

/** One real label chip (`px-1.5 py-0.5 text-[11px]`, 22.5px tall) with its text ghosted. */
function GhostLabelChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-blueprint/25 bg-blueprint/[0.05] px-1.5 py-0.5 text-[11px]">
      <BlueprintGhostText text={text} />
    </span>
  );
}

/** A `rounded-md px-2 py-1 text-[11.5px] font-medium` row action with its label ghosted. */
function GhostRowAction({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11.5px] font-medium">
      <BlueprintGhostText text={text} />
    </span>
  );
}

/**
 * `AdminNewIssuesTable` / `AdminIssuesSinceOnboardingTable`: the real
 * `overflow-x-auto rounded-[10px] border` wrapper, `<table>` with the
 * real `min-w` and `text-[12.5px]`, the real column headings as text, and
 * rows whose cells repeat the real cells' markup with ghosted content.
 *
 * `withAddedColumn` adds the since-onboarding table's "Added to
 * DevTunnel" date column (and its wider 1200px minimum).
 */
export function BlueprintAdminIssuesTable({
  rows = 8,
  withAddedColumn = false,
}: {
  rows?: number;
  withAddedColumn?: boolean;
}) {
  const headings = withAddedColumn
    ? ["Issue", "Project", "GitHub author", "Labels", "Added to DevTunnel", "Created", "Updated", "Actions"]
    : ["Issue", "Project", "GitHub author", "Labels", "Created", "Updated", "Actions"];

  return (
    <div className="overflow-x-auto rounded-[10px] border border-blueprint/25" aria-hidden="true">
      <table
        className={`w-full ${
          withAddedColumn ? "min-w-[1200px]" : "min-w-[1080px]"
        } border-collapse text-left text-[12.5px]`}
      >
        <thead>
          <tr className="border-b border-blueprint/25 bg-blueprint/[0.05]">
            {headings.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-blueprint/60"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-blueprint/15 last:border-b-0">
              {/* Issue: icon + title, then "#number · state" */}
              <th scope="row" className={`${TABLE_CELL} font-medium`}>
                <span className="inline-flex items-start gap-1.5">
                  <BlueprintFill className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[3px]" />
                  <span>
                    <span className="block">
                      <BlueprintGhostText text="Issue title that describes the problem or request" />
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px]">
                      <BlueprintGhostText text="#1234 · Open" />
                    </span>
                  </span>
                </span>
              </th>

              {/* Project + repository */}
              <td className={TABLE_CELL}>
                <p className="m-0">
                  <BlueprintGhostText text="Project name" />
                </p>
                <p className="m-0 mt-0.5 flex items-center gap-1.5 font-mono text-[11px]">
                  <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
                  <BlueprintGhostText text="owner/repository-name" />
                </p>
              </td>

              {/* GitHub author */}
              <td className={TABLE_CELL}>
                <BlueprintGhostText text="@username" />
              </td>

              {/* Labels */}
              <td className={TABLE_CELL}>
                <div className="flex flex-wrap items-center gap-1">
                  <GhostLabelChip text="bug" />
                  <GhostLabelChip text="good first issue" />
                  <GhostLabelChip text="help wanted" />
                </div>
              </td>

              {withAddedColumn ? (
                <td className={`whitespace-nowrap ${TABLE_CELL}`}>
                  <BlueprintGhostText text="Jan 5, 2026" />
                </td>
              ) : null}

              {/* Created, Updated */}
              <td className={`whitespace-nowrap ${TABLE_CELL}`}>
                <BlueprintGhostText text="Jan 5, 2026" />
              </td>
              <td className={`whitespace-nowrap ${TABLE_CELL}`}>
                <BlueprintGhostText text="Feb 12, 2026" />
              </td>

              {/* Actions: View, Create task, Ignore */}
              <td className={TABLE_CELL}>
                <div className="flex flex-wrap items-center gap-1">
                  <GhostRowAction text="View" />
                  <GhostRowAction text="Create task" />
                  <GhostRowAction text="Ignore" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The header both admin issue pages share: `mb-8 flex flex-wrap
 * items-start justify-between gap-4`, the title block on the left (an
 * `h1` `mb-1 text-xl`, a wrapping `text-sm` description — both ghosted
 * from the real copy) and, on the right, `SyncAllIssuesButton`
 * (`px-3.5 py-2 text-[13px]`, outlined) beside the solid "Create task"
 * link (`px-4 py-2 text-[13px]`).
 */
function BlueprintAdminIssuesHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div>
        <h1 className="m-0 mb-1 text-xl font-medium">
          <BlueprintGhostText text={title} />
        </h1>
        <BlueprintGhostParagraph text={description} className="m-0 text-sm" />
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col items-start gap-1.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-blueprint/25 bg-blueprint/[0.05] px-3.5 py-2 text-[13px] font-medium">
            <BlueprintGhostText text="Sync all issues" />
          </span>
        </div>
        <span className="relative inline-flex shrink-0 items-center rounded-[8px] px-4 py-2 text-[13px] font-medium">
          <span className="invisible">Create task</span>
          <BlueprintFill className="absolute inset-0 rounded-[8px]" />
        </span>
      </div>
    </div>
  );
}

/**
 * A full admin issue list page: header, filter stack, table, pagination.
 *
 * The filter stack is the real one (`AdminNewIssuesExplorer` /
 * `AdminIssuesSinceOnboardingExplorer`): the 36.75px search field then
 * State / Repository / Author / Tech stack / Project, `mb-3`. There is no
 * "Match my profile" button on these pages. Pagination is 20 per page.
 */
export function BlueprintAdminIssuesPage({
  title,
  description,
  withAddedColumn = false,
  children,
}: {
  title: string;
  description: string;
  withAddedColumn?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <BlueprintAdminIssuesHeader title={title} description={description} />
      <BlueprintPublicFilterBar
        labels={["State", "Repository", "Author", "Tech stack", "Project"]}
        bottomMarginClassName="mb-3"
      />
      {children}
      <BlueprintAdminIssuesTable rows={8} withAddedColumn={withAddedColumn} />
      <BlueprintListPagination itemLabel="issue" />
    </>
  );
}
