import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for
 * `/github-open-source-tools/:slug`. Same blueprint-sheet convention as
 * `/github-projects/[slug]/loading.tsx`, trimmed to match this page's
 * own layout exactly: a logo'd header (`withLogo`) with two
 * action-button placeholders ("View on GitHub" + "Request to add as
 * DevTunnel project or tool"), then a tab bar and a single info-panel
 * placeholder below it — so nothing shifts position once
 * `getGithubOpenSourceToolBySlug()` resolves and the real header, tabs,
 * and Project Info panel swap in.
 */
export default function GithubToolDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 10.1 — Tool"
      revLabel="Rev — loading tool"
      contentClassName="w-full mx-auto max-w-4xl px-6 py-10"
    >
      <BlueprintDetailHeader
        withLogo
        meta={
          <>
            <BlueprintFill className="h-3 w-40" />
            <span className="text-blueprint/50">·</span>
            <BlueprintFill className="h-3 w-16" />
            <span className="text-blueprint/50">·</span>
            <BlueprintFill className="h-3 w-20" />
            <span className="text-blueprint/50">·</span>
            <BlueprintFill className="h-3 w-24" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-36" />
            <BlueprintFill className="h-9 w-52" />
          </>
        }
      />

      <div className="mb-4 flex gap-4 border-b border-blueprint/15 pb-[9px]">
        <BlueprintFill className="h-3.5 w-20" />
        <BlueprintFill className="h-3.5 w-16" />
        <BlueprintFill className="h-3.5 w-14" />
      </div>

      <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
          <BlueprintFill className="h-2.5 w-20" />
          <BlueprintFill className="h-2.5 w-3/5" />
          <BlueprintFill className="h-2.5 w-24" />
          <BlueprintFill className="h-2.5 w-16" />
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-2.5 w-20" />
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-2.5 w-10" />
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-2.5 w-10" />
        </div>
        <div className="mt-4 border-t border-blueprint/15 pt-4">
          <BlueprintFill className="mb-2 h-2.5 w-20" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <BlueprintFill key={index} className="h-5 w-16 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </BlueprintSheet>
  );
}
