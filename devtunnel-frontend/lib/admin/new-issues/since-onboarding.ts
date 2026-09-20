/**
 * Filtering helper for the Admin **New Issues Since Onboarding** page
 * (`/admin/tasks/new-issues/since-onboarding`).
 *
 * This is not a separate feature from New Issues (admin_workflow.txt,
 * section 16) — it is the same "present on GitHub AND not currently
 * covered by DevTunnel" list, narrowed to one extra condition: the
 * GitHub issue was opened on or after the day its project was added to
 * DevTunnel (`AdminNewIssueProjectRef.onboardedAt`, set at Project
 * Onboarding — section 28: "CREATE PROJECT → ACTIVE PROJECT").
 *
 * Why this view exists: a repository that already existed on GitHub for
 * years before it was onboarded can bring hundreds of old, pre-existing
 * issues into the New Issues list on day one, burying the ones that
 * actually appeared *because* the project is now on DevTunnel. This
 * lens answers "what's new since we added this project", not "what's
 * new on GitHub, full stop" — the plain `/admin/tasks/new-issues` page
 * already covers that unfiltered case.
 *
 * Kept as a plain, exported function (not folded into the explorer
 * component) so the Server Component page below can filter once before
 * render, the same division of labor `getAdminNewIssues` already keeps
 * between data-fetching and `AdminNewIssuesExplorer`'s in-browser
 * search/filter narrowing.
 */
 import type { AdminNewIssue } from "./types";

 export function filterNewIssuesSinceOnboarding(issues: AdminNewIssue[]): AdminNewIssue[] {
   return issues.filter((issue) => {
     const createdAt = new Date(issue.createdAt).getTime();
     const onboardedAt = new Date(issue.project.onboardedAt).getTime();
 
     // Unparseable dates are excluded rather than guessed at — surfacing
     // an issue under a false "since onboarding" claim would misrepresent
     // data this frontend doesn't actually have (rule 58).
     if (Number.isNaN(createdAt) || Number.isNaN(onboardedAt)) return false;
 
     return createdAt >= onboardedAt;
   });
 }