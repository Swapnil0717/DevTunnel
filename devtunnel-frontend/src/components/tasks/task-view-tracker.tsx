"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { recordTaskView } from "@/lib/tasks/client-api";

/**
 * Renders nothing. Mounted once on the task page
 * (`/projects/:projectSlug/tasks/:taskId`), it tells the backend that the
 * signed-in contributor opened this task, which is what lets the Profile's
 * Tasks tab list the tasks they've seen (`POST /tasks/:id/view`).
 *
 * It fires from the browser, after the page is showing, rather than from the
 * server-side task fetch — so a link prefetch or a crawler rendering the page
 * never counts as a person having looked at it, and the write can't slow down
 * the page load.
 *
 * Only for a signed-in viewer: a signed-out visitor has no profile to record
 * against. `useAuth` reports `"loading"` for a moment on a page the server
 * couldn't resolve a user for, so this waits for `"authenticated"` rather
 * than firing on the first render.
 *
 * The ref keeps it to once per task per mount — React's dev-mode double
 * invocation of effects, or an auth refresh re-running this effect, must not
 * send the same view twice. (The backend is idempotent anyway; this just
 * avoids the wasted request.)
 */
export function TaskViewTracker({ taskId }: { taskId: string }) {
  const { status } = useAuth();
  const recordedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (recordedFor.current === taskId) return;

    recordedFor.current = taskId;
    void recordTaskView(taskId);
  }, [status, taskId]);

  return null;
}
