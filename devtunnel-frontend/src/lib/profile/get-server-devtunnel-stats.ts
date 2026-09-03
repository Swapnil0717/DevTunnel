import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { DevTunnelStats } from "./types";

/**
 * Server-side `GET /users/me/devtunnel-stats`, forwarding the incoming
 * request's cookies — used by `profile/page.tsx` so "Projects", "Tasks
 * done", and "Pull requests" render with real numbers on first paint, no
 * client-side loading flash. Same pattern as
 * `get-server-contributions-summary.ts`.
 *
 * Returns `null` on any failure — callers render an honest "not
 * available" state (ProfileStats' existing "—" treatment) rather than
 * surfacing the specific reason.
 */
export async function getServerDevTunnelStats(): Promise<DevTunnelStats | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/devtunnel-stats`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as { data?: DevTunnelStats };
    return body.data ?? null;
  } catch {
    return null;
  }
}