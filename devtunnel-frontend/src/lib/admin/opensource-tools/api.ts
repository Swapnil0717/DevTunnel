// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { AdminToolDetail, AdminToolSummary } from "./types";

/**
 * `GET /admin/opensource-tools` — not built on the backend yet (see the
 * note in `types.ts`; `routes/admin/index.ts` only mounts
 * `/admin/opensource-tools/onboarding` so far), so, same convention as
 * `getAdminProjects`, every call is expected to fail until that route
 * ships. Catching that here means the page degrades to one honest
 * `SectionMessage`, never a blank/broken page
 * (Frontend_Development_Rules.txt rule 26).
 */
type AdminOpenSourceToolsResult =
  | { status: "ok"; data: AdminToolSummary[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * `GET /admin/opensource-tools` is keyset-paginated on the backend
 * (`limit`/`before`, `X-Next-Cursor` response header, mirroring
 * `GET /admin/projects`). `fetchAllAdminPages` walks every page and
 * hands back the complete list, so `AdminOpenSourceToolsExplorer` can
 * filter it and then page through the result 20-at-a-time with real
 * numbered "Page 1 of N" controls, instead of only ever showing the
 * first backend page's worth of tools.
 */
export async function getAdminOpenSourceTools(): Promise<AdminOpenSourceToolsResult> {
  const result = await fetchAllAdminPages<AdminToolSummary>("/admin/opensource-tools");
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}

/**
 * `GET /admin/opensource-tools/:id` — same "not built yet" convention as
 * above. A `404` is kept as its own explicit state (`not-found`), same
 * reasoning as `getAdminProjectDetail`: an unknown tool id is a real
 * "this page doesn't exist" outcome the page should answer with Next's
 * `notFound()`, not the same "come back later" messaging as a network
 * failure (Frontend_Development_Rules.txt rule 25).
 */
type AdminOpenSourceToolDetailResult =
  | { status: "ok"; data: AdminToolDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getAdminOpenSourceToolDetail(
  id: string,
): Promise<AdminOpenSourceToolDetailResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/${id}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminToolDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}