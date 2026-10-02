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


/**
 * `POST /tasks/:id/feedback` (devtunnel-backend src/routes/contributionFeedback.ts)
 * — saves the contributor's 1–5 rating and optional message from the post-PR
 * prompt on the task Contribute page.
 *
 * Unlike `recordTaskView`, this is a deliberate user action, so the caller
 * needs to know whether it worked: it resolves `true` when saved and `false`
 * for any failure (offline, rate-limited, not eligible, older backend without
 * the route), and never throws. The prompt shows one honest "try again" line
 * for `false`; it doesn't need to tell the causes apart.
 *
 * Idempotent per (task, user) server-side — sending again replaces the
 * earlier answer.
 */
export async function submitContributionFeedback(
  taskId: string,
  feedback: { rating: number; message: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: feedback.rating, message: feedback.message.trim() || null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
