// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/admin/tasks/client-api.ts`. Kept out of `./api.ts`, which imports
// `next/headers` and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";

export class AdminNewIssuesApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminNewIssuesApiError";
    this.status = status;
  }
}

/**
 * `POST /admin/new-issues/:id/ignore` — section 16's "Frontend" action
 * list is explicit: "View, Create Task, Ignore… Only include actions
 * supported by the actual workflow." Unlike View and Create Task
 * (already-real routes — the issue itself has no DevTunnel detail page,
 * so View opens the GitHub issue directly, and Create Task opens
 * `/admin/tasks/new`), Ignore has no dedicated endpoint in section 22's
 * API map, which only lists the two `GET` routes for this feature. This
 * single `POST` is the natural, minimal counterpart the spec's own
 * action list requires and is named to match the workflow's own
 * vocabulary ("Ignore") rather than repurposing the task-deletion
 * endpoint — an ignored issue was never a DevTunnel task, so there is
 * nothing to delete (section 15's "Deleted in DevTunnel" is a distinct
 * concept: a task that *did* exist).
 *
 * Ignoring only affects DevTunnel's own "new issue" bookkeeping —
 * exactly like "The GitHub issue is not deleted just because the
 * DevTunnel representation is deleted" (section 15) applies here too:
 * the GitHub issue itself is never touched.
 */
export async function ignoreAdminNewIssue(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/new-issues/${id}/ignore`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new AdminNewIssuesApiError(`Failed to ignore issue (${res.status})`, res.status);
  }
}