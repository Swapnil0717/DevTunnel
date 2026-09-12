// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/admin/projects/client-api.ts`. Kept out of `./api.ts`, which
// imports `next/headers` and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";
import type { AdminToolDetail, AdminToolUpdatePayload } from "./types";

export class AdminOpenSourceToolsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminOpenSourceToolsApiError";
    this.status = status;
  }
}

/**
 * `DELETE /admin/opensource-tools/:id` — the grid card's and detail
 * page's "Delete" action. Not in `routes/admin/index.ts` yet either (see
 * `./api.ts`), but follows the exact same shape the backend already uses
 * for `DELETE /admin/projects/:id`. Removes only the DevTunnel catalog
 * row — the tool's own repository/site is never touched.
 */
export async function deleteAdminOpenSourceTool(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    throw new AdminOpenSourceToolsApiError(`Failed to delete tool (${res.status})`, res.status);
  }
}

/**
 * `PATCH /admin/opensource-tools/:id` — backs the detail page's inline
 * edit panel (`EditOpenSourceToolDetailsPanel`), the same fields Steps
 * 2–4 of onboarding hand the Admin (description, labels, setup guide),
 * now editable after the tool is already published. See
 * `AdminToolUpdatePayload` in `./types` for exactly what this can and
 * can't change.
 */
export async function updateAdminOpenSourceTool(
  id: string,
  payload: AdminToolUpdatePayload,
): Promise<AdminToolDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new AdminOpenSourceToolsApiError(`Failed to update tool (${res.status})`, res.status);
  }

  return (await res.json()) as AdminToolDetail;
}

/**
 * `POST /admin/opensource-tools/:id/refresh-readme` — the Tool Detail
 * edit panel's "Fetch latest README" action
 * (`EditOpenSourceToolDetailsPanel`). Re-pulls the README from the
 * tool's `sourceUrl`; returns the full refreshed `AdminToolDetail`.
 */
export async function refreshAdminOpenSourceToolReadme(id: string): Promise<AdminToolDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/${id}/refresh-readme`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new AdminOpenSourceToolsApiError(`Failed to refresh README (${res.status})`, res.status);
  }

  return (await res.json()) as AdminToolDetail;
}