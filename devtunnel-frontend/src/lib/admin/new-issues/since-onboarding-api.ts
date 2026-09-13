// Server Component only — reads request cookies via `getAdminNewIssues`,
// don't import from client code.
import { getAdminNewIssues } from "./api";
import { filterNewIssuesSinceOnboarding } from "./since-onboarding";
import type { AdminNewIssue } from "./types";

/**
 * Data loader for `/admin/tasks/new-issues/since-onboarding`.
 *
 * There is no separate backend endpoint for this view — it is the exact
 * same `GET /admin/new-issues` list `getAdminNewIssues` already fetches
 * (see that file's note on the route not being built yet), narrowed by
 * `filterNewIssuesSinceOnboarding`. A second network call for a subset
 * of data the frontend already has would be redundant, not more
 * correct.
 *
 * Mirrors `AdminNewIssuesResult`'s three states so the page can reuse
 * the same error/empty/ok rendering convention: "empty" here means
 * either no new issues exist at all, or none of them were opened on or
 * after their project's onboarding date — both render the same honest
 * `SectionMessage` rather than a blank table.
 */
type AdminNewIssuesSinceOnboardingResult =
  | { status: "ok"; data: AdminNewIssue[]; nextCursor: string | null }
  | { status: "empty" }
  | { status: "error" };

export async function getAdminNewIssuesSinceOnboarding(params?: {
  before?: string;
}): Promise<AdminNewIssuesSinceOnboardingResult> {
  const result = await getAdminNewIssues(params);

  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };

  const filtered = filterNewIssuesSinceOnboarding(result.data);

  // Only treat a truly-first-page, all-filtered-out result as "empty" —
  // a later page filtering down to zero on its own still has earlier
  // pages (and a Previous control) to go back to.
  if (filtered.length === 0 && !params?.before) return { status: "empty" };

  return { status: "ok", data: filtered, nextCursor: result.nextCursor };
}