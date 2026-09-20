// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/admin/projects/client-api.ts`. Kept out of `./api.ts`, which
// imports `next/headers` and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";
import type { AdminTaskDetail, AdminTaskUpdatePayload } from "./types";

export class AdminTasksApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminTasksApiError";
    this.status = status;
  }
}

/**
 * `DELETE /admin/tasks/:id` (admin_workflow.txt section 22 — Admin
 * Backend API Map, "Tasks"). Removes only the DevTunnel representation
 * of the task — the underlying GitHub issue is never touched (section
 * 15: "The GitHub issue is not deleted just because the DevTunnel
 * representation is deleted"), same principle
 * `deleteAdminProject` documents for repositories.
 */
export async function deleteAdminTask(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    throw new AdminTasksApiError(
      `Failed to delete task (${res.status})`,
      res.status,
    );
  }
}

/**
 * `PATCH /admin/tasks/:id` (admin_workflow.txt section 22 — Admin
 * Backend API Map, "Tasks"). Backs the Task Detail page's inline edit
 * panel (`EditTaskDetailsPanel`) — the same role/difficulty/custom
 * description Task Onboarding's Step 5 hands the Admin, plus the task's
 * own DevTunnel status, now editable after the task is already live. See
 * `AdminTaskUpdatePayload` in `./types` for exactly what this can and
 * can't change.
 */
export async function updateAdminTask(
  id: string,
  payload: AdminTaskUpdatePayload,
): Promise<AdminTaskDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new AdminTasksApiError(
      `Failed to update task (${res.status})`,
      res.status,
    );
  }

  return (await res.json()) as AdminTaskDetail;
}