import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintFill,
  BlueprintGhostText,
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintPublicHeader,
  BlueprintHeaderButton,
  BlueprintAiSummary,
  BlueprintTabStrip,
  BlueprintWaysPanel,
  BlueprintContributeSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/github-projects/:slug/contribute`.
 *
 * Renders through the same `ContributePageHeader` / `ContributeTabs` /
 * `ContributeSidebar` as the project and tool Contribute pages, so it is
 * the same sheet: back link, three-part breadcrumb, title row (logo,
 * "Contribute to …", repository link, description, and the "Repository
 * overview" / "View on GitHub" buttons), the AI summary card in its
 * loading state, the four-tab strip and the contribute rail. A raw
 * GitHub repository has no DevTunnel tasks (`tasks` is always `[]`), so
 * the page always opens on "Ways to contribute" and the tasks tab has no
 * count badge.
 */
export default function GithubProjectContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 09.2 — Contribute"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Project name" />
      <BlueprintBreadcrumb text="GitHub Projects / Project name / Contribute" />

      <BlueprintPublicHeader
        title="Contribute to Project name"
        description
        meta={
          <span className="inline-flex items-center gap-1.5 font-mono">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="owner/repository-name" />
          </span>
        }
        buttons={
          <>
            <BlueprintHeaderButton label="Repository overview" icon={false} />
            <BlueprintHeaderButton label="View on GitHub" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlueprintAiSummary />
          <BlueprintTabStrip
            labels={[
              "Ways to contribute",
              "DevTunnel tasks",
              "How to submit",
              "Submit via DevTunnel CLI",
            ]}
          />
          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
            <BlueprintWaysPanel />
          </div>
        </div>
        <BlueprintContributeSidebar />
      </div>
    </BlueprintSheet>
  );
}
