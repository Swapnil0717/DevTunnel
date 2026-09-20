// Server Component only — reads request cookies via fetchAllAdminPages / cookies(), don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { Task, TaskDetail } from "./types";

/**
 * `GET /tasks` — the contributor-facing counterpart to
 * `GET /admin/tasks` (`lib/admin/tasks/api.ts`): every active DevTunnel
 * task, so a contributor can browse, search, and filter to find
 * something to work on from `/tasks` ("Tasks" in `AppSidebar` /
 * `AppBottomNav`).
 *
 * Not confirmed against the backend yet — same documented-assumption
 * convention as `lib/issues/api.ts` and `lib/admin/tasks/api.ts`
 * (Frontend_Development_Rules.txt rule 58: don't invent data, but a
 * plausible, clearly-flagged endpoint name is fine while the backend
 * catches up — TODO: confirm the real path with backend). Every call is
 * expected to fail (network error / 404) until that route ships;
 * `getTasks` catches that and the page degrades to one honest
 * `SectionMessage`, never a blank/broken page.
 *
 * Reuses `fetchAllAdminPages` even though it lives under `lib/admin/` —
 * the helper itself is generic over any keyset-paginated `limit`/`before`
 * + `X-Next-Cursor` list endpoint (see its own doc comment), with no
 * admin auth/API coupling, so duplicating it here just to avoid the
 * `admin` path segment would be the same logic twice
 * (Frontend_Development_Rules.txt rule 51). Assumed paginated the same
 * way `GET /admin/tasks` already is, since both would read from the same
 * `devtunnel.tasks` table this app already has — a cheap indexed query,
 * not a live external scan, so this walk uses the same default page size
 * every other database-backed list endpoint does.
 *
 * `getTaskDetail` below is the single-task sibling, backing the
 * `/projects/:projectSlug/tasks/:taskId` page.
 */
type TasksResult =
  | { status: "ok"; data: Task[] }
  | { status: "empty" }
  | { status: "error" };

export async function getTasks(): Promise<TasksResult> {
  const result = await fetchAllAdminPages<Task>("/tasks");
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}

/**
 * `GET /projects/:projectSlug/tasks/:taskId` — backs the task's own
 * DevTunnel page (`/projects/:projectSlug/tasks/:taskId`), the "View
 * Task" destination `TaskRow` (`components/home/task-row.tsx`) and
 * `TasksTable` (`components/tasks/tasks-table.tsx`) already link to.
 *
 * A `404` is kept as its own explicit state (`not-found`), same reason
 * `getAdminTaskDetail` (`lib/admin/tasks/api.ts`) keeps one — a task id
 * that doesn't exist, or doesn't belong to `projectSlug`, is a real
 * "this page doesn't exist" outcome that should render Next's real
 * `notFound()`, not the same "come back later" messaging as a network
 * failure (Frontend_Development_Rules.txt rule 25).
 */
type TaskDetailResult =
  | { status: "ok"; data: TaskDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getTaskDetail(
  projectSlug: string,
  taskId: string,
): Promise<TaskDetailResult> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectSlug)}/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: { cookie: (await cookies()).toString() },
        cache: "no-store",
      },
    );

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as TaskDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}