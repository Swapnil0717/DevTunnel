// devtunnel-frontend/src/lib/admin/bug-reports/api.ts
// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { ADMIN_BUG_REPORTS_PAGE_SIZE, type AdminBugReportsPage } from "./types";

type AdminBugReportsResult = { status: "ok"; data: AdminBugReportsPage } | { status: "error" };

/**
 * `GET /admin/bug-reports` — one page of reports, newest first. `before` is the
 * cursor the previous page returned. Needs `admin:bug-reports:read`; a 401/403
 * or any backend hiccup degrades to `{ status: "error" }`, never to a made-up
 * empty list.
 */
export async function getAdminBugReportsPage(before?: string): Promise<AdminBugReportsResult> {
  try {
    const params = new URLSearchParams({ limit: String(ADMIN_BUG_REPORTS_PAGE_SIZE) });
    if (before) params.set("before", before);

    const res = await fetch(`${API_BASE_URL}/admin/bug-reports?${params.toString()}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };

    const body = (await res.json()) as { data?: AdminBugReportsPage };
    if (!body.data || !Array.isArray(body.data.reports)) return { status: "error" };
    return { status: "ok", data: body.data };
  } catch {
    return { status: "error" };
  }
}
