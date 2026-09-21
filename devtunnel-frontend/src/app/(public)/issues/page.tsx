import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getIssues, type IssuesFailureReason } from "@/lib/issues/api";
import { IssuesExplorer } from "@/components/issues/issues-explorer";
import { IssuesRetryButton } from "@/components/issues/issues-retry-button";
import { SignInLink } from "@/components/auth/sign-in-link";
import { SectionMessage } from "@/components/home/section-message";
import { IssuesLoadingSheet } from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

export const metadata: Metadata = buildMetadata({
  title: "All Issues",
  description:
    "Every open GitHub issue across DevTunnel's onboarded projects, searchable and filterable by project, repository, author, and tech stack.",
  path: "/issues",
  // Publicly viewable (no sign-in needed), but not indexed: this is a live
  // aggregation of third-party GitHub data rather than DevTunnel's own
  // content, so indexing it would add thin/duplicate pages (rule 24).
  // `followLinks` keeps it crawlable so the onboarded pages it links to are
  // still discovered.
  noIndex: true,
  followLinks: true,
});

/**
 * What the failure state tells the visitor, per `getIssues()` failure
 * reason. The old page showed one identical "check back soon" line for
 * every failure, which made a signed-out visit, an API outage and a
 * rate limit indistinguishable — for the visitor and for whoever was
 * debugging it. Only the signed-out case is something the visitor can
 * fix themselves, so only that one offers sign-in instead of a retry.
 */
const FAILURE_MESSAGES: Record<Exclude<IssuesFailureReason, "signed-out">, string> = {
  "not-found": "The issues service isn't available yet — check back soon.",
  "rate-limited": "Too many requests right now. Wait a moment, then try again.",
  "server-error": "Couldn't load issues right now. Please try again in a moment.",
  unreachable: "Couldn't reach DevTunnel to load issues. Please try again in a moment.",
};

function IssuesUnavailable({ reason }: { reason: IssuesFailureReason }) {
  if (reason === "signed-out") {
    return (
      <div className="flex flex-col items-start gap-3">
        <SectionMessage>Sign in to browse open issues across DevTunnel&apos;s projects.</SectionMessage>
        <SignInLink variant="solid">Sign in</SignInLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <SectionMessage>{FAILURE_MESSAGES[reason]}</SectionMessage>
      {reason === "not-found" ? null : <IssuesRetryButton />}
    </div>
  );
}

/**
 * `/issues` — "All Issues" in `AppSidebar` / `AppBottomNav`. The
 * contributor-facing counterpart to the Admin Portal's
 * `/admin/tasks/new-issues` ("All Issue") page: every open GitHub issue
 * across DevTunnel's onboarded projects, browsable with search + filters
 * and 10-per-page pagination (`IssuesExplorer`), layered on top of
 * `GET /issues` (`getIssues` — see `lib/issues/api.ts`).
 *
 * The server renders only the first page — the most recently updated
 * issues — so the page appears quickly and one slow backend read can't
 * hold it hostage; a "Load all issues" button in the explorer fetches
 * the rest from the browser. This is the same shape the GitHub catalog
 * pages use.
 *
 * Unlike the Admin page, there's no "Create task" / "Ignore" / "Sync"
 * here — those curate DevTunnel's task list and re-trigger a live
 * cross-project GitHub scan, both Admin/Maintainer responsibilities
 * (`AdminNewIssuesTable`, `SyncAllIssuesButton`). This page is read-only
 * browsing for a contributor deciding what to work on next.
 */
export default async function IssuesPage() {
  const result = await getIssues();

  return (
    <BlueprintReveal skeleton={<IssuesLoadingSheet scanning={false} />}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="m-0 mb-1 text-xl font-medium text-text">All Issues</h1>
          <p className="m-0 text-sm text-text-muted">
            Every open GitHub issue across DevTunnel&apos;s onboarded projects — search or filter to
            find something to work on.
          </p>
        </div>

        {result.status === "error" ? (
          <IssuesUnavailable reason={result.reason} />
        ) : result.status === "empty" ? (
          <SectionMessage>No open GitHub issues right now — check back soon.</SectionMessage>
        ) : (
          <IssuesExplorer issues={result.data} hasMore={result.hasMore} />
        )}
      </main>
    </BlueprintReveal>
  );
}