// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AdminAuthMe } from "./types";

/**
 * `GET /admin/auth/me` (devtunnel-backend/src/routes/admin/auth.ts).
 *
 * `(protected)/layout.tsx` already does the real access-control check
 * for every `/admin/*` route via the generic `GET /auth/me` +
 * `isAdmin()` (see that layout's own doc comment for why: it's the same
 * check the rest of the site already uses, and the backend
 * independently re-authorizes every `/admin/*` API call regardless of
 * what any frontend check returns). This fetches the admin-specific
 * counterpart in addition to that, purely for its one piece of
 * additional, real information the generic route doesn't carry: the
 * signed-in admin's actual RBAC `permissions` list
 * (`permissionsForRole`, devtunnel-backend `src/lib/rbac.ts`) — so a
 * page can show, e.g., "12 permissions granted" or hide an action the
 * admin doesn't hold, without duplicating the permission table
 * client-side.
 *
 * Returns `null` on anything other than a real `200` (including a
 * `401`/`403`, which `(protected)/layout.tsx` will already have turned
 * into a redirect before this ever renders) — callers treat that the
 * same as "permissions unknown", never as "zero permissions".
 */
export async function getAdminAuthMe(): Promise<AdminAuthMe | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/auth/me`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as { data: AdminAuthMe };
    return body.data;
  } catch {
    return null;
  }
}