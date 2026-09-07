// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AdminProjectSummary } from "./types";

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