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
  BlueprintContributeTasksPanel,
  BlueprintContributeSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/projects/:projectSlug/contribute`.
 *
 * Mirrors `ContributePageHeader` and the page body element for element:
 * back link, three-part breadcrumb, title row (56px logo, `text-xl`
 * "Contribute to …", the repository link, the 70ch description, and the
 * "Project overview" / "View on GitHub" buttons), then the AI summary
 * card (loading state) above the four-tab strip and its panel, beside
 * the contribute rail. The panel drawn is "DevTunnel tasks" — the tab
 * the page opens on when the project has tasks; a project with none
 * opens on "Ways to contribute" instead, with the same header, tabs and
 * rail around it.
 */
export default function ProjectContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05.2 — Contribute"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Project name" />
      <BlueprintBreadcrumb text="Projects / Project name / Contribute" />

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
            <BlueprintHeaderButton label="Project overview" icon={false} />
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
            badges={[1]}
          />
          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
            <BlueprintContributeTasksPanel />
          </div>
        </div>
        <BlueprintContributeSidebar />
      </div>
    </BlueprintSheet>
  );
}
