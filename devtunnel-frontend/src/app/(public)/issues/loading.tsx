import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintPageHeader, BlueprintFilterBar } from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/issues` ("All Issues").
 *
 * Wrapped in the exact same page shell the real page renders
 * (`mx-auto max-w-6xl px-6 py-10`, `BlueprintPageHeader`, and a
 * 5-filter `BlueprintFilterBar` matching `IssuesExplorer`'s real filter
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
/**
 * The sheet itself, shared with `issues/page.tsx`: `BlueprintReveal`
 * paints this same sheet over the loaded page (see blueprint-reveal.tsx)
 * — with `scanning={false}`, since by then the scan is finished and a
 * "Scanning…" notice would be wrong.
 */
export function IssuesLoadingSheet({ scanning = true }: { scanning?: boolean }) {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 08 — Issues"
      revLabel={scanning ? "Rev — scanning repositories" : "Rev — scan complete"}
      contentClassName="mx-auto w-full max-w-6xl px-6 py-10"
      ariaHidden={!scanning}
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintFilterBar filters={5} />
      {scanning ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-[4px] border border-dashed border-white/40 bg-white/[0.05] px-6 py-14 text-center"
        >
          <p className="m-0 text-[12.5px] text-white">
            Scanning DevTunnel&apos;s projects for open GitHub issues…
          </p>
          <p className="m-0 max-w-[420px] text-[11.5px] text-white/70">
            This checks every onboarded repo live, so larger project lists can take a little
            while. Feel free to leave this tab open — it&apos;ll load automatically.
          </p>
        </div>
      ) : (
        <BlueprintFill className="h-[220px] w-full" />
      )}
    </BlueprintSheet>
  );
}

export default function IssuesLoading() {
  return <IssuesLoadingSheet />;
}
