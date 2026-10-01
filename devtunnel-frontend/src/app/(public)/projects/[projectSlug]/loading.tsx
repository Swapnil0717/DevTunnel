import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintFill,
  BlueprintGhostText,
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintPublicHeader,
  BlueprintHeaderButton,
  BlueprintTabStrip,
  BlueprintInfoPanel,
  BlueprintProjectSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/projects/:projectSlug`.
 *
 * Mirrors the real page's DOM, element for element, so every placeholder
 * lands where the real content will: the back link and breadcrumb
 * (`mb-4` / `mb-6`), the title row (56px logo, `text-xl` title, meta row,
 * and the button group — the Contribute button is a two-line column, a
 * 35.5px button over its 12px "See …" link, which makes the whole row
 * taller than the logo), then the two-column body: the tab strip over
 * the Project Info panel (AI summary in its loading state, the nine-row
 * definition grid, the tech-stack block) on the left, and the project
 * rail on the right. Text is reserved with invisible ghost text at the
 * real font size rather than hand-sized bars (see `BlueprintGhostText`).
 *
 * Not drawn, because they only exist for some projects / viewers: the
 * "Task progress" and "Your match" rail cards.
 */
export default function ProjectDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05.1 — Project"
      revLabel="Rev — loading project"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Projects" />
      <BlueprintBreadcrumb text="Projects / Project name" />

      <BlueprintPublicHeader
        title="Project name"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="owner/repository-name" />
            </span>
            <span className="text-blueprint/50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <BlueprintFill className="h-1.5 w-1.5 shrink-0 rounded-full" />
              <BlueprintGhostText text="Active" />
            </span>
            <span className="text-blueprint/50">·</span>
            <BlueprintGhostText text="Updated 2 days ago" />
          </>
        }
        buttons={
          <>
            <BlueprintHeaderButton
              label="Contribute to this project"
              bordered={false}
              note="See the 3 open tasks first"
            />
            <BlueprintHeaderButton label="Star 12" />
            <BlueprintHeaderButton label="View on GitHub" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlueprintTabStrip
            labels={["Project Info", "README", "Tasks", "All Issues"]}
            badges={[2, 3]}
          />
          <BlueprintInfoPanel rows={9} tagHeading="Tech stack" />
        </div>
        <BlueprintProjectSidebar />
      </div>
    </BlueprintSheet>
  );
}
