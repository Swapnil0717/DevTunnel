// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { AdminTaskDetail, AdminTaskSummary } from "./types";

/**
 * `GET /admin/tasks` (admin_workflow.txt, section 13 — Task Page ▸
 * Backend; section 22 — Admin Backend API Map). Not built on the backend
 * yet — see the note in `types.ts` — so, same convention as
 * `lib/admin/projects/api.ts`, every call is expected to fail (network
 * error / 404) until that route ships. Catching that here means the
 * page degrades to one honest `SectionMessage`, never a blank/broken
 * page.
 */
type AdminTasksResult =
  | { status: "ok"; data: AdminTaskSummary[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * `GET /admin/tasks` is keyset-paginated on the backend (`limit`/
 * `before`, `X-Next-Cursor` response header, mirroring
 * `GET /admin/projects`). `fetchAllAdminPages` walks every page and
 * hands back the complete list, so `AdminTasksExplorer` can filter it
 * and then page through the result 20-at-a-time with real numbered
 * "Page 1 of N" controls, instead of only ever seeing the first backend
 * page's worth of tasks.
 */
export async function getAdminTasks(): Promise<AdminTasksResult> {
  const result = await fetchAllAdminPages<AdminTaskSummary>("/admin/tasks");
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}

/**
 * `GET /admin/tasks/:id` (admin_workflow.txt, section 22 — Admin Backend
 * API Map, "Tasks"; A14 — "Task Details" in the final page list, section
 * 29). Same not-built-yet convention as `getAdminTasks` above.
 *
 * A `404` is kept as its own explicit state (`not-found`), same reason
 * `getAdminProjectDetail` keeps one — an unknown task id is a real
 * "this page doesn't exist" outcome that should render Next's `notFound()`
 * (Frontend_Development_Rules.txt rule 25), not the same "come back
 * later" messaging as a network failure.
 */
type AdminTaskDetailResult =
  | { status: "ok"; data: AdminTaskDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getAdminTaskDetail(id: string): Promise<AdminTaskDetailResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/tasks/${id}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminTaskDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

/**
 * `GET /admin/projects/:id/tasks` (admin_workflow.txt section 18 —
 * "Project Detail Page"). Backs that page's "DevTunnel tasks" section —
 * the actual list behind the `taskCount` stat already shown there. Same
 * three-state result shape as `getAdminTasks`/`getAdminProjectDetail` so
 * the page can render one honest `SectionMessage` on failure rather than
 * a blank section (Frontend_Development_Rules.txt rule 25).
 */
type AdminProjectTasksResult =
  | { status: "ok"; data: AdminTaskSummary[] }
  | { status: "empty" }
  | { status: "not-found" }
  | { status: "error" };

export async function getAdminProjectTasks(projectId: string): Promise<AdminProjectTasksResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/projects/${projectId}/tasks`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminTaskSummary[];

    if (Array.isArray(data) && data.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}