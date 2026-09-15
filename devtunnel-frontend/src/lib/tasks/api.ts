// Server Component only — reads request cookies via fetchAllAdminPages, don't import from client code.
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { Task } from "./types";

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