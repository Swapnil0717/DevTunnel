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
  BlueprintToolSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/opensource-tools/:toolSlug`.
 *
 * Mirrors the real page's DOM, element for element (see
 * `/projects/:projectSlug/loading.tsx` for the reasoning): back link and
 * breadcrumb, the title row with its two-line Contribute button column,
 * then the five-tab strip over the Tool Info panel (AI summary in its
 * loading state, a seven-row definition grid, the "What it's useful for"
 * tag block) beside the tool rail. Text is reserved with invisible ghost
 * text at the real font size (see `BlueprintGhostText`).
 *
 * Drawn for a tool that has a repository, the common case. A tool with
 * no repository ends up with one button fewer, a shorter info grid, and
 * no GitHub stat block, Maintainer or Clone card; a skeleton can't know
 * that before the fetch resolves, and guessing the smaller shape would
 * make the common case reflow instead.
 */
export default function ToolDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 06.1 — Tool"
      revLabel="Rev — loading tool"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Open Source Tools" />
      <BlueprintBreadcrumb text="Open Source Tools / Tool name" />

      <BlueprintPublicHeader
        title="Tool name"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <BlueprintGhostText text="github.com/owner/tool-name" />
            </span>
            <span className="text-blueprint/50">·</span>
            <BlueprintGhostText text="Added 3 months ago" />
          </>
        }
        buttons={
          <>
            <BlueprintHeaderButton
              label="Contribute to this tool"
              bordered={false}
              note="See how to contribute first"
            />
            <BlueprintHeaderButton label="Star 12" />
            <BlueprintHeaderButton label="View on GitHub" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <BlueprintTabStrip
            labels={["Tool Info", "Setup Guide", "Tasks", "README", "All Issues"]}
            badges={[4]}
          />
          <BlueprintInfoPanel rows={7} tagHeading="What it's useful for" />
        </div>
        <BlueprintToolSidebar />
      </div>
    </BlueprintSheet>
  );
}
