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
  BlueprintGithubSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/github-projects/:slug`.
 *
 * Mirrors `GithubProjectDetailPage` element for element (same approach as
 * `/projects/:projectSlug/loading.tsx`): back link and breadcrumb, the
 * title row (56px logo, `text-xl` name, the mono repository link and
 * "Updated …" line; Contribute, View on GitHub, Star and "Nominate for
 * DevTunnel" buttons), then the four-tab strip (the Issues tab carries a
 * count) over the Project Info panel — AI summary in its loading state,
 * the six-row definition grid and the tech-stack block — beside the
 * GitHub rail (About, Maintainer, Clone, Share).
 */
export default function GithubProjectDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 09.1 — Project"
      revLabel="Rev — loading project"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to GitHub Projects" />
      <BlueprintBreadcrumb text="GitHub Projects / Project name" />

      <BlueprintPublicHeader
        title="Project name"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="owner/repository-name" />
            </span>
            <span className="text-blueprint/50">·</span>
            <BlueprintGhostText text="Updated 2 days ago" />
          </>
        }
        buttons={
          <>
            <BlueprintHeaderButton label="Contribute" bordered={false} />
            <BlueprintHeaderButton label="View on GitHub" />
            <BlueprintHeaderButton label="Star 12" />
            <BlueprintHeaderButton label="Nominate for DevTunnel" icon={false} />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlueprintTabStrip labels={["Project Info", "README", "Tasks", "Issues"]} badges={[3]} />
          <BlueprintInfoPanel rows={6} tagHeading="Tech stack" />
        </div>
        <BlueprintGithubSidebar />
      </div>
    </BlueprintSheet>
  );
}
