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
 * Route-segment loading boundary for `/opensource-tools/:toolSlug/contribute`.
 *
 * Mirrors `ContributePageHeader` and the page body element for element
 * (see `/projects/:projectSlug/contribute/loading.tsx`): back link,
 * three-part breadcrumb, title row with the "Tool overview" / "View on
 * GitHub" buttons, the AI summary card (loading state), the four-tab
 * strip and the contribute rail. The panel drawn is "Ways to contribute"
 * — the tab the page opens on when the tool has no DevTunnel tasks,
 * which is the usual case for a tool (its tasks come from a linked
 * shadow project that many tools don't have). A tool that does have
 * tasks opens on "DevTunnel tasks" instead, with the same header, tabs
 * and rail around it.
 */
export default function ToolContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 06.2 — Contribute"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Tool name" />
      <BlueprintBreadcrumb text="Open Source Tools / Tool name / Contribute" />

      <BlueprintPublicHeader
        title="Contribute to Tool name"
        description
        meta={
          <span className="inline-flex items-center gap-1.5 font-mono">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="owner/repository-name" />
          </span>
        }
        buttons={
          <>
            <BlueprintHeaderButton label="Tool overview" icon={false} />
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
