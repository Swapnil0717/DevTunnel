import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { ProfileActivity } from "./types";

/**
 * Server-side `GET /users/me/profile-activity` (devtunnel-backend
 * src/routes/profileActivity.ts), forwarding the incoming request's cookies —
 * used by `profile/page.tsx` so the Projects and Tasks tabs render on first
 * paint, same pattern as the other `get-server-*` fetchers in this folder.
 *
 * Returns `null` on any failure — callers render an honest "couldn't load
 * this" state instead of an empty one. That distinction matters here: an empty
 * `{ projects: [], tasks: [] }` means "you haven't done anything yet", and
 * showing that for a failed request would tell a contributor their work was
 * lost (Frontend_Development_Rules.txt rule 58: never present a guess as a
 * fact).
 */
export async function getServerProfileActivity(): Promise<ProfileActivity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/me/profile-activity`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as Partial<ProfileActivity>;
    if (!Array.isArray(body.projects) || !Array.isArray(body.tasks)) return null;

    return { projects: body.projects, tasks: body.tasks };
  } catch {
    return null;
  }
}
