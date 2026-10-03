// devtunnel-frontend/src/lib/admin/sponsors/client-api.ts
// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `lib/admin/projects/client-api.ts`.
import { API_BASE_URL } from "@/lib/config";
import type {
  AdminManualSponsorPayload,
  AdminSponsor,
  AdminSponsorGoal,
  AdminSponsorGoalPayload,
  AdminSponsorPatch,
  AdminSponsorsPage,
  AdminSponsorStatus,
} from "./types";
import { ADMIN_SPONSORS_PAGE_SIZE } from "./types";

export class AdminSponsorsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminSponsorsApiError";
    this.status = status;
  }
}

/**
 * One fetch, one error shape. The backend answers failures with
 * `{ error: { code, message, requestId } }`; its `message` is written for
 * people (e.g. "githubUsername must be a valid GitHub username ..."), so it
 * is kept on the thrown error and the forms can show it as is.
 */
async function request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method,
    credentials: "include",
    // Only send a Content-Type when there is a body, so a plain GET stays a "simple" request.
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string" && body.error.message) message = body.error.message;
    } catch {
      // Not JSON (a proxy error page, say): keep the generic message.
    }
    throw new AdminSponsorsApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export interface ListAdminSponsorsParams {
  /** Keyset cursor from the previous page's `nextCursor`. */
  before?: string | null;
  status?: AdminSponsorStatus | null;
  approved?: boolean | null;
  limit?: number;
}

/** `GET /admin/sponsors` — newest first; `?status=captured&approved=false` is the approval queue. */
export async function listAdminSponsors(params: ListAdminSponsorsParams = {}): Promise<AdminSponsorsPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? ADMIN_SPONSORS_PAGE_SIZE) });
  if (params.before) query.set("before", params.before);
  if (params.status) query.set("status", params.status);
  if (params.approved !== null && params.approved !== undefined) query.set("approved", String(params.approved));

  const body = await request<{ data: AdminSponsorsPage }>(`/admin/sponsors?${query.toString()}`, { method: "GET" });
  return body.data;
}

/** `POST /admin/sponsors` — adds a manual sponsor (201). */
export async function createManualSponsor(payload: AdminManualSponsorPayload): Promise<AdminSponsor> {
  const body = await request<{ data: { sponsor: AdminSponsor } }>("/admin/sponsors", {
    method: "POST",
    body: payload,
  });
  return body.data.sponsor;
}

/** `PATCH /admin/sponsors/:id` — moderation fields only. Returns the updated row. */
export async function updateAdminSponsor(id: string, patch: AdminSponsorPatch): Promise<AdminSponsor> {
  const body = await request<{ data: { sponsor: AdminSponsor } }>(`/admin/sponsors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
  return body.data.sponsor;
}

/** `PUT /admin/sponsor-goal` — creates or replaces one month's goal. */
export async function setAdminSponsorGoal(payload: AdminSponsorGoalPayload): Promise<AdminSponsorGoal> {
  const body = await request<{ data: { goal: AdminSponsorGoal } }>("/admin/sponsor-goal", {
    method: "PUT",
    body: payload,
  });
  return body.data.goal;
}
