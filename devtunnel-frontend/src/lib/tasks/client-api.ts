// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/projects/client-api.ts`. Kept out of `./api.ts`, which reads request
// cookies via `next/headers` and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";

/**
 * `POST /tasks/:id/view` (devtunnel-backend src/routes/profileActivity.ts) —
 * records that the signed-in contributor opened this task's page, so the
 * Profile's Tasks tab can show which tasks they've seen.
 *
 * A view is attention, not work: it never changes the task, a contribution
 * count or the calendar. It is idempotent server-side, so calling it again
 * for the same task just refreshes "last viewed".
 *
 * **Best-effort by design.** Nothing on the task page depends on it, so a
 * failure (offline, rate-limited, an older backend without the route) is
 * swallowed and reported as `false` rather than thrown — a bookkeeping write
 * must never be able to break or delay the page someone is reading.
 */
export async function recordTaskView(taskId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}/view`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
