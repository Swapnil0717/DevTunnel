// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { DevtunnelProjectDetail } from "./types";

/**
 * `GET /projects/:slug` — backs the View Project page
 * (`/projects/:projectSlug`).
 *
 * Three outcomes, same split `getTaskDetail` (`lib/tasks/api.ts`) and
 * `getGithubProjectBySlug` (`lib/github-projects/api.ts`) already use: a
 * slug that matches nothing is a real "this page doesn't exist" result
 * and renders Next's `notFound()`, never a fabricated empty project
 * (Frontend_Development_Rules.txt rule 25); a network/5xx failure is a
 * separate, temporary "couldn't load this right now" state with
 * different messaging.
 *
 * Not confirmed against the backend yet — see `./types.ts` for the same
 * documented-assumption note. TODO: confirm the real path and payload.
 */
export type DevtunnelProjectResult =
  | { status: "ok"; data: DevtunnelProjectDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getDevtunnelProjectBySlug(
  slug: string,
): Promise<DevtunnelProjectResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(slug)}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as DevtunnelProjectDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}