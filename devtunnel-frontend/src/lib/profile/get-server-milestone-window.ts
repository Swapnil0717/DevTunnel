import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { MilestoneWindow } from "./types";

/**
 * Server-side `GET /users/me/contributions/milestones`, forwarding the
 * incoming request's cookies — used by `profile/page.tsx` so the 30-day
 * milestone track renders with real data on first paint, no client-side
 * loading flash. Same pattern as `get-server-devtunnel-stats.ts`.
 *
 * Returns `null` on any failure — `MilestoneTrack` renders an honest
 * "not available" state (matching ProfileStats' existing "—" treatment)
 * rather than a guessed or zeroed-out track (Frontend_Development_Rules.txt
 * rule 58/59: never invent progress).
 */
export async function getServerMilestoneWindow(): Promise<MilestoneWindow | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/contributions/milestones`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as { data?: MilestoneWindow };
    return body.data ?? null;
  } catch {
    return null;
  }
}
