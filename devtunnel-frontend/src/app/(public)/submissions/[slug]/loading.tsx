import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintFill,
  BlueprintGhostText,
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintPublicHeader,
  BlueprintHeaderButton,
  BlueprintSubmissionSections,
  BlueprintSubmissionSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/submissions/:slug`. Without its own,
 * navigating here would show the list page's skeleton from `../loading.tsx`
 * — a stack of cards where a detail page is about to appear.
 *
 * Mirrors `SubmissionDetailPage` in its own `max-w-5xl` column: "Back to
 * Community", the `Community / name` breadcrumb, the title row (56px logo,
 * name, kind · mono repository · "Submitted …" meta; View on GitHub and
 * upvote buttons), then About / Details / README cards beside the rail
 * (Submitted by, AI summary, Repository, Share).
 *
 * Not drawn, because they only exist for some submissions or viewers: the
 * "Alternative to …" badge and the owner-only Edit / Delete buttons.
 */
export default function SubmissionDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 11.1 — Submission"
      revLabel="Rev — loading submission"
      contentClassName="w-full mx-auto max-w-5xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Community" />
      <BlueprintBreadcrumb text="Community / Submission name" />

      <BlueprintPublicHeader
        title="Submission name"
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="Project" />
            </span>
            <span className="text-blueprint/50">·</span>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="owner/repository-name" />
            </span>
            <span className="text-blueprint/50">·</span>
            <BlueprintGhostText text="Submitted 3 days ago" />
          </>
        }
        buttons={
          <>
            <BlueprintHeaderButton label="View on GitHub" />
            <BlueprintHeaderButton label="Upvote 12" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <BlueprintSubmissionSections />
        <BlueprintSubmissionSidebar />
      </div>
    </BlueprintSheet>
  );
}
