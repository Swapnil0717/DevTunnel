// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `lib/auth/api.ts` and
// `lib/admin/project-onboarding/api.ts`. Kept out of `./api.ts`, which
// imports `next/headers` and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";
import type { AdminProjectDetail, AdminProjectUpdatePayload } from "./types";

export class AdminProjectsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminProjectsApiError";
    this.status = status;
  }
}

/**
 * `DELETE /admin/projects/:id` — the Projects table's "Sync" row action
 * (admin_workflow.txt section 4) and the Project Detail page's "Sync
 * GitHub" action (section 18) are replaced here with "Delete project" per
 * product direction. This endpoint isn't in section 22's Admin Backend
 * API Map yet (only `GET`/`PATCH /admin/projects/:id` are listed there),
 * but it follows the exact same shape the spec already defines for tasks
 * (`DELETE /admin/tasks/:id`).
 *
 * Deleting the DevTunnel project never touches GitHub — the same
 * principle section 15 states for tasks ("GitHub Issue remains") applies
 * here: only the DevTunnel representation of the repository is removed,
 * never the repository itself.
 */
export async function deleteAdminProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    throw new AdminProjectsApiError(`Failed to delete project (${res.status})`, res.status);
  }
}

/**
 * `PATCH /admin/projects/:id` (admin_workflow.txt section 22 — Admin
 * Backend API Map, "Projects"). Backs the Project Detail page's inline
 * edit panel (`EditProjectDetailsPanel`) — the same two fields Project
 * Onboarding's Step 2 (Description) and Step 3 (Tech Stack) hand the
 * Admin, now editable after the project is already live, without
 * touching the GitHub repository itself. See `AdminProjectUpdatePayload`
 * in `./types` for exactly what this can and can't change.
 *
 * Client-side (not `./api.ts`) for the same reason `deleteAdminProject`
 * is: it's a mutation triggered from a Client Component, carried by the
 * session cookie via `credentials: "include"`, not a server-rendered
 * `GET`.
 */
export async function updateAdminProject(
  id: string,
  payload: AdminProjectUpdatePayload,
): Promise<AdminProjectDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new AdminProjectsApiError(`Failed to update project (${res.status})`, res.status);
  }

  return (await res.json()) as AdminProjectDetail;
}