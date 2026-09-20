import { SkeletonPageHeader, SkeletonFilterBar } from "@/components/ui/skeleton";
import { LoadingPanel } from "@/components/ui/spinner";

/**
 * Next.js route-segment loading boundary for `/issues` ("All Issues").
 *
 * Wrapped in the exact same page shell the real page renders
 * (`mx-auto max-w-6xl px-6 py-10`, `SkeletonPageHeader`, and a
 * 5-filter `SkeletonFilterBar` matching `IssuesExplorer`'s real filter
 * bar — State, Repository, Author, Tech stack, Project) so nothing
 * shifts position once `getIssues()` resolves — only the area below the
 * filters swaps from the spinner to the real table.
 *
 * That area deliberately stays a spinner, not a fourth skeleton table:
 * `getIssues()` walks `GET /issues`, the contributor-facing counterpart
 * to `GET /admin/new-issues` — a route this app treats as re-scanning
 * every onboarded project's GitHub repository live, on every request,
 * with no DevTunnel-side cache. A skeleton table there would imply
 * "almost done, just a cosmetic delay"; a spinner with a real
 * description is the honest signal for a wait that can genuinely take
 * a few seconds on a larger install. Without this file, that wait
 * would render as nothing at all — no spinner, no visible change —
 * which is indistinguishable from a broken click.
 */
export default function IssuesLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <SkeletonPageHeader withAction={false} />
      <SkeletonFilterBar filters={5} />
      <LoadingPanel
        label="Scanning DevTunnel's projects for open GitHub issues…"
        description="This checks every onboarded repo live, so larger project lists can take a little while. Feel free to leave this tab open — it'll load automatically."
      />
    </main>
  );
}