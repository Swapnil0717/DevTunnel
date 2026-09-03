import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { ContributionSummary } from "./types";

/**
 * Server-side `GET /users/me/contributions/summary`, forwarding the
 * incoming request's cookies — used by `profile/page.tsx` so the
 * "Contributions" stat renders with the real number on first paint,
 * with no client-side loading flash (same pattern as
 * `lib/auth/get-server-user.ts`).
 *
 * Returns `null` on any failure (signed out, GitHub account not linked,
 * GitHub unavailable, etc.) — callers render an honest "not available"
 * state rather than surfacing the specific reason, matching
 * ProfileStats' existing "—" treatment for stats with no data.
 */
export async function getServerContributionsSummary(): Promise<ContributionSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/contributions/summary`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as { data?: ContributionSummary };
    return body.data ?? null;
  } catch {
    return null;
  }
}