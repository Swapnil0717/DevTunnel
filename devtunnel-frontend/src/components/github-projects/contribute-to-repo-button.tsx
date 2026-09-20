import Link from "next/link";
import { PlusIcon } from "@/components/layout/nav-icons";

interface ContributeToRepoButtonProps {
  slug: string;
  /** Which raw GitHub catalog this repository's detail page lives under. */
  basePath: "/github-projects" | "/github-open-source-tools";
}

/**
 * Header CTA for a raw GitHub-catalog detail page — `GithubProjectDetailPage`
 * (`/github-projects/:slug`) and `GithubToolDetailPage`
 * (`/github-open-source-tools/:slug`). Same accent-colored, primary-action
 * styling and destination shape `ContributeButton`
 * (`components/projects/contribute-button.tsx`) and `ContributeToToolButton`
 * (`components/opensource-tools/contribute-to-tool-button.tsx`) use on the
 * onboarded Project/Tool detail pages: one accent button, and clicking it
 * opens a DevTunnel Contribute page for this exact repository.
 *
 * **Not a join action**, and that's the one real difference from its two
 * siblings. `ContributeButton`/`ContributeToToolButton` call a join
 * endpoint first (`joinDevtunnelProject` / `joinOpenSourceTool`) because
 * there's a real contributor relationship to record on an onboarded
 * project or tool. A repository still sitting in the raw GitHub catalog
 * has no such record — no `devtunnel.projects`/`devtunnel.opensource_tools`
 * row to join yet — so there's nothing to call and nothing to await. This
 * is a plain link straight to
 * `/github-projects/:slug/contribute` or `/github-open-source-tools/:slug/contribute`
 * (`app/(public)/github-projects/[slug]/contribute/page.tsx` /
 * `app/(public)/github-open-source-tools/[slug]/contribute/page.tsx`),
 * which renders the same `ContributePageHeader` / `ContributeTabs` /
 * `ContributeSidebar` components the onboarded pages use, built from a
 * `ContributeTarget` of kind `"github-repo"` (`lib/contribute/types.ts`).
 * That page's own Tasks tab is what explains — same posture the tool's
 * Tasks tab already takes for `devtunnel.tasks` hanging off a project,
 * never a tool (sql/017) — that this repository's tasks aren't available
 * yet because it isn't a DevTunnel project or tool at all, and will be
 * once it's converted into one.
 */
export function ContributeToRepoButton({ slug, basePath }: ContributeToRepoButtonProps) {
  return (
    <Link
      href={`${basePath}/${slug}/contribute`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      Contribute
    </Link>
  );
}
