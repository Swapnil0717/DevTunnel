import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { ContributionSummary } from "./types";

/**
 * Server-side `GET /users/me/contributions/devtunnel/summary`, forwarding
 * the incoming request's cookies — used by `profile/page.tsx` so the
 * "Contributions" stat's "via DevTunnel" number renders on first paint,
 * same pattern as `get-server-contributions-summary.ts` for the GitHub
 * total.
 *
 * Returns `null` on any failure — callers render an honest "not
 * available" state rather than surfacing the specific reason, matching
 * ProfileStats' existing "—" treatment.
 */
export async function getServerDevTunnelContributionsSummary(): Promise<ContributionSummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/contributions/devtunnel/summary`, {
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