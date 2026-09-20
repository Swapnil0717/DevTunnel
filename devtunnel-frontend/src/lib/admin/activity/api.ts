// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AdminActivityPage, AdminAuditEntry } from "./types";

/**
 * Same page size ceiling `fetch-all-pages.ts` uses for every other admin
 * list endpoint (`listQuerySchema` on `GET /admin/activity` caps `limit`
 * at 100) — the widest page size, so walking the full log takes the
 * fewest round trips.
 */
const MAX_PAGE_LIMIT = 100;

/**
 * Safety ceiling on how many pages one request will ever walk — same
 * reasoning and same value `fetch-all-pages.ts` uses: 200 pages * 100 =
 * 20,000 rows, comfortably above what one page load should ever need,
 * and a hard stop rather than an infinite loop if the cursor ever
 * repeated itself.
 */
const MAX_PAGES = 200;

type AdminActivityResult =
  | { status: "ok"; data: AdminAuditEntry[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * `GET /admin/activity` (devtunnel_workflow.txt section 43;
 * `src/routes/admin/activity.ts`). Keyset-paginated the same way as
 * `GET /admin/projects` / `/admin/tasks` / `/admin/opensource-tools` /
 * `/admin/new-issues` (`limit`/`before`), but the cursor comes back in
 * the JSON body (`{ data: { nextCursor } }`) rather than an
 * `X-Next-Cursor` response header — see `AdminActivityPage` in
 * `./types` for why. `fetchAllAdminPages` (`lib/admin/fetch-all-pages.ts`)
 * only knows the header convention, so this walks the log itself with
 * the same "keep what was gathered so far if a later page fails" and
 * "stop walking, don't loop forever" behavior that helper already gives
 * every other admin list.
 *
 * Only admins holding the `admin:activity:read` permission can reach
 * this route (`requirePermission`, src/lib/rbac.ts) — today every admin
 * account holds it, so a `403` here reads the same as any other backend
 * hiccup and degrades to the same honest `SectionMessage`, never a
 * fabricated empty log.
 */
export async function getAdminActivityLog(): Promise<AdminActivityResult> {
  try {
    const entries: AdminAuditEntry[] = [];
    let before: string | undefined;
    let pages = 0;

    do {
      const query = new URLSearchParams({ limit: String(MAX_PAGE_LIMIT) });
      if (before) query.set("before", before);

      const res = await fetch(`${API_BASE_URL}/admin/activity?${query.toString()}`, {
        headers: { cookie: (await cookies()).toString() },
        cache: "no-store",
      });

      if (!res.ok) {
        return entries.length > 0 ? { status: "ok", data: entries } : { status: "error" };
      }

      const body = (await res.json()) as { data: AdminActivityPage };
      entries.push(...body.data.entries);

      before = body.data.nextCursor ?? undefined;
      pages += 1;
    } while (before && pages < MAX_PAGES);

    if (entries.length === 0) return { status: "empty" };
    return { status: "ok", data: entries };
  } catch {
    return { status: "error" };
  }
}

/**
 * The dashboard's "Recent activity" preview only ever needs the newest
 * handful of entries, not the full walked log `getAdminActivityLog`
 * returns — this fetches exactly one page (already newest-first) and
 * skips paginating further. `limit` is capped the same way the backend
 * caps it (`listQuerySchema`, max 100) even though callers here only
 * ever ask for a handful.
 */
export async function getRecentAdminActivity(limit = 5): Promise<AdminActivityResult> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/admin/activity?${new URLSearchParams({ limit: String(limit) }).toString()}`,
      {
        headers: { cookie: (await cookies()).toString() },
        cache: "no-store",
      },
    );

    if (!res.ok) return { status: "error" };

    const body = (await res.json()) as { data: AdminActivityPage };
    if (body.data.entries.length === 0) return { status: "empty" };
    return { status: "ok", data: body.data.entries };
  } catch {
    return { status: "error" };
  }
}