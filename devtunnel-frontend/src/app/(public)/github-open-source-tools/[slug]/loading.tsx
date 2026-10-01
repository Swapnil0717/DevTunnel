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
 * Next.js route-segment loading boundary for
 * `/github-open-source-tools/:slug`.
 *
 * The page renders the same components as `/github-projects/:slug`
 * (`GithubProjectDetailTabs`, `GithubProjectSidebar`), so this is the
 * same sheet with the catalog's own wording: "Back to Github Open Source
 * Tools", that breadcrumb, and the tool-specific request button
 * (`RequestToolOnboardingButton` reads "Request to add as DevTunnel
 * project or tool", not "Nominate for DevTunnel" — it is a much wider
 * button, so the header wraps differently).
 *
 * Like the project page: the 56px logo is a circle (`RepoLogo`), and the
 * Project Info panel uses the GitHub catalog's 140px label column with
 * its real six labels (Description … Forks).
 */
export default function GithubToolDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 10.1 — Tool"
      revLabel="Rev — loading tool"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Github Open Source Tools" />
      <BlueprintBreadcrumb text="Github Open Source Tools / Tool name" />

      <BlueprintPublicHeader
        circularLogo
        title="Tool name"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="owner/tool-name" />
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
            <BlueprintHeaderButton label="Request to add as DevTunnel project or tool" icon={false} />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlueprintTabStrip labels={["Project Info", "README", "Tasks", "Issues"]} badges={[3]} />
          <BlueprintInfoPanel
            rows={6}
            labelColumn="140px"
            rowLabels={[
              { label: "Description", value: "A short description of the repository goes here" },
              { label: "Primary language", value: "TypeScript" },
              { label: "License", value: "MIT License" },
              { label: "Contributors", value: "1,234" },
              { label: "Stars", value: "12,345" },
              { label: "Forks", value: "1,234" },
            ]}
            tagHeading="Tech stack"
          />
        </div>
        <BlueprintGithubSidebar />
      </div>
    </BlueprintSheet>
  );
}
