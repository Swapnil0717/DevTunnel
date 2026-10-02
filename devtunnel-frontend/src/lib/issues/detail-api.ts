// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { IssueDetail } from "./detail-types";

/**
 * `GET /issues/:projectSlug/:issueNumber` — backs the View Issue page
 * (`/issues/:projectSlug/:issueNumber`) and the issue Contribute page under
 * it. The single-issue sibling of `getIssues` (`./api.ts`), the way
 * `getTaskDetail` (`lib/tasks/api.ts`) is to `getTasks`.
 *
 * Same three outcomes every detail route in this app uses: an unknown
 * project, or an issue number that doesn't exist (or is a pull request), is
 * a real "this page doesn't exist" result that renders Next's `notFound()`
 * (Frontend_Development_Rules.txt rule 25); anything else going wrong is a
 * separate, temporary "couldn't load this right now" state.
 *
 * `issueNumber` arrives from the URL as a string. Anything that isn't a plain
 * positive integer is a `not-found` without a request — it can't be an issue,
 * and the backend would only answer 400.
 *
 * Cookies are forwarded because the backend resolves the signed-in user for
 * its per-user rate limit — the payload itself is the same for every viewer.
 */
export type IssueDetailResult =
  | { status: "ok"; data: IssueDetail }
  | { status: "not-found" }
  | { status: "error" };

const ISSUE_NUMBER_PATTERN = /^[1-9]\d{0,7}$/;

export async function getIssueDetail(projectSlug: string, issueNumber: string): Promise<IssueDetailResult> {
  if (!ISSUE_NUMBER_PATTERN.test(issueNumber)) return { status: "not-found" };

  try {
    const res = await fetch(
      `${API_BASE_URL}/issues/${encodeURIComponent(projectSlug)}/${issueNumber}`,
      {
        headers: { cookie: (await cookies()).toString() },
        cache: "no-store",
      },
    );

    if (res.status === 404) return { status: "not-found" };

    if (!res.ok) {
      console.error("[issue-detail] request failed", {
        status: res.status,
        requestId: res.headers.get("x-request-id"),
      });
      return { status: "error" };
    }

    const data = (await res.json()) as IssueDetail;
    return { status: "ok", data };
  } catch (err) {
    console.error("[issue-detail] could not be reached", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error" };
  }
}
