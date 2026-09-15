import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { listAvailableProjects, type ContributorMatchProfile } from "../db/projects";

/**
 * Contributor — Projects on DevTunnel (`/projects` — "Projects on
 * Devtunnel" in `AppSidebar`/`AppBottomNav`). Mounted on the app root in
 * src/index.ts (`app.route("/", projects)`), same convention as
 * `/tasks`/`/issues`/`/github-projects` — reachable by any signed-in
 * contributor, not just admins.
 *
 * Distinct from `GET /github-projects` (src/routes/githubProjects.ts):
 * this is DevTunnel's own curated catalog — see src/db/projects.ts's doc
 * comment for the full data-source distinction.
 */
export const projects = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `GET /projects/available` — every active, onboarded DevTunnel project,
 * newest first (devtunnel_workflow.txt Module 3: "Find an Open Source
 * Project" / `GET /projects/available`). This is the one real, spec'd
 * endpoint `devtunnel-frontend/src/lib/home/api.ts`'s `getRecommendedProjects`
 * calls, both for the `/projects` page and the home page's "Recommended
 * for you" section.
 *
 * `requireAuth` only — no admin role required, same reasoning
 * `GET /tasks`/`GET /issues` already document for themselves: browsing
 * DevTunnel's project list to find something to work on is not an admin
 * action.
 *
 * Response body is the raw `ProjectSummary[]` array — NOT wrapped in the
 * `{ data: ... }` envelope (src/lib/response.ts) — matching the
 * already-shipped frontend contract (`fetchFromApi<ProjectSummary[]>` in
 * lib/home/api.ts, which parses the body directly as `T`), the same
 * documented exception every other list route in this backend uses
 * (`GET /tasks`, `GET /admin/tasks`, `GET /admin/projects`, `GET /issues`).
 * Error responses still use the standard
 * `{ error: { code, message, requestId } }` envelope.
 *
 * Unlike `GET /tasks?recommended=true`, a contributor who hasn't finished
 * onboarding is NOT rejected here — `/projects` is a browsable catalog a
 * signed-in contributor can land on before ever completing onboarding
 * (the Contributor Home Module's "Find an Open Source Project" button),
 * so every active project is still returned; it's only the per-project
 * `matchPercent`/`matchRole` fields that are quietly omitted when there's
 * no onboarding profile to score against (see `computeMatch` in
 * src/db/projects.ts).
 */
projects.get("/projects/available", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Cheap indexed-table read, same generous per-minute budget
  // `GET /tasks` (src/routes/tasks.ts) applies to its own list read.
  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-available-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    // Only score matches against a profile that actually has onboarding
    // answers recorded — an account that never finished onboarding has
    // empty arrays for all three fields, which `computeMatch` already
    // treats as "no signal" on its own, but skipping the object entirely
    // here keeps that behavior explicit at the call site too.
    const profile: ContributorMatchProfile | null = user.onboardingCompleted
      ? {
          developerRoles: user.developerRoles,
          skills: user.skills,
          technologies: user.technologies,
        }
      : null;

    const list = await listAvailableProjects(supabase, profile);
    return c.json(list, 200);
  } catch (err) {
    logger.error("projects_available_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load projects right now");
  }
});