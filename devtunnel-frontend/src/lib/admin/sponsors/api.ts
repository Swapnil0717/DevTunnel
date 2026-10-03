// devtunnel-frontend/src/lib/admin/sponsors/api.ts
// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { ADMIN_SPONSORS_PAGE_SIZE, type AdminSponsorsPage } from "./types";

type AdminSponsorsResult = { status: "ok"; data: AdminSponsorsPage } | { status: "error" };

/**
 * `GET /admin/sponsors` — the newest page (up to 100 rows) for the first
 * paint of `/admin/sponsors`. One request only: the page's "Load more"
 * button walks older rows from the browser, so a long history never makes
 * the server render slower. Needs `admin:sponsors:read`; a 401/403 or any
 * backend hiccup degrades to `{ status: "error" }`, never to a made-up
 * empty list.
 */
export async function getAdminSponsorsFirstPage(): Promise<AdminSponsorsResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/sponsors?limit=${ADMIN_SPONSORS_PAGE_SIZE}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };

    const body = (await res.json()) as { data?: AdminSponsorsPage };
    if (!body.data || !Array.isArray(body.data.sponsors)) return { status: "error" };
    return { status: "ok", data: body.data };
  } catch {
    return { status: "error" };
  }
}
