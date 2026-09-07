// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AdminProjectDetail, AdminProjectSummary } from "./types";

/**
 * `GET /admin/projects` (admin_workflow.txt, section 4 — Projects Page ▸
 * Backend; section 22 — Admin Backend API Map). Not built on the backend
 * yet — see the note in `types.ts` — so, same convention as
 * `lib/home/api.ts`, every call is expected to fail (network error / 404)
 * until that route ships. Catching that here means the page degrades to
 * one honest `SectionMessage`, never a blank/broken page.
 */
type AdminProjectsResult =
  | { status: "ok"; data: AdminProjectSummary[] }
  | { status: "empty" }
  | { status: "error" };

export async function getAdminProjects(): Promise<AdminProjectsResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/projects`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminProjectSummary[];

    if (Array.isArray(data) && data.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

/**
 * `GET /admin/projects/:id` (admin_workflow.txt, section 18 — Project
 * Detail Page; section 22 — Admin Backend API Map). Not built on the
 * backend yet either — same convention as `getAdminProjects` above — so
 * every call is expected to fail until that route ships, and the page
 * degrades to one honest `SectionMessage` rather than a blank page.
 *
 * A `404` is kept as its own explicit state (`not-found`) rather than
 * folded into `error`: an unknown project id is a real "this page
 * doesn't exist" outcome the page should answer with Next's `notFound()`
 * (Frontend_Development_Rules.txt rule 25 — a nonexistent URL must not
 * render as if it succeeded), not the same "come back later" messaging
 * as a network failure.
 */
type AdminProjectDetailResult =
  | { status: "ok"; data: AdminProjectDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getAdminProjectDetail(id: string): Promise<AdminProjectDetailResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/projects/${id}`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminProjectDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}