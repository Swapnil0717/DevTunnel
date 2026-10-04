import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerUser } from "./get-server-user";
import { isAdmin } from "./is-admin";
import { AUTH_FLAG_COOKIE } from "./session";
import { getServerViewMode } from "./view-mode.server";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";

/**
 * Sends a signed-in visitor away from the marketing landing page.
 *
 * Used by `app/page.tsx` ("/"). Everyone who is not signed in (visitors,
 * signed-out users and search-engine crawlers) falls straight through and
 * sees the landing page. A signed-in user never does: clicking the
 * DevTunnel logo anywhere, following a Google result or typing the bare
 * domain all end up on their user home.
 *
 * The cheap `dt_auth` flag cookie is checked first so anonymous requests
 * don't cost a backend call. The flag is never trusted on its own: the
 * redirect only happens once `GET /auth/me` confirms a real session, so a
 * stale cookie just shows the landing page instead of bouncing the user
 * through /home -> /login.
 *
 * Destinations mirror `app/login/page.tsx`:
 *  - admin in "admin" view  -> /admin
 *  - admin in "user" view   -> /home
 *  - admin with no view set -> /login (the portal chooser)
 *  - everyone else          -> /onboarding if unfinished, otherwise /home
 */
export async function redirectSignedInUser(): Promise<void> {
  const jar = await cookies();
  if (!jar.has(AUTH_FLAG_COOKIE)) return;

  const user = await getServerUser();
  if (!user) return;

  if (isAdmin(user)) {
    const viewMode = await getServerViewMode();
    if (viewMode === "admin") redirect("/admin");
    if (viewMode === "user") redirect("/home");
    redirect("/login");
  }

  if (needsOnboarding(user)) redirect("/onboarding");

  redirect("/home");
}
