import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { listAvailableOpenSourceTools } from "../db/openSourceTools";

/**
 * Contributor — Open Source Tools on DevTunnel (`/opensource-tools` —
 * "Open Source Tools on Devtunnel" in `AppSidebar`/`AppBottomNav`).
 * Mounted on the app root in src/index.ts (`app.route("/", openSourceTools)`),
 * same convention as `/projects`/`/tasks`/`/github-open-source-tools` —
 * reachable by any signed-in contributor, not just admins.
 *
 * Distinct from `GET /github-open-source-tools`
 * (src/routes/githubOpenSourceTools.ts): this is DevTunnel's own curated
 * catalog — see src/db/openSourceTools.ts's doc comment for the full
 * data-source distinction.
 */
export const openSourceTools = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `GET /opensource-tools/available` — every published DevTunnel open
 * source tool, newest first. This is the one real endpoint
 * `devtunnel-frontend/src/lib/opensource-tools/api.ts`'s
 * `getOpenSourceTools` calls for the `/opensource-tools` page — the same
 * "flagged as not-yet-confirmed, built directly off the published
 * `devtunnel.opensource_tools` columns" contract that file's own doc
 * comment describes, now backed by a real route.
 *
 * `requireAuth` only — no admin role required, same reasoning
 * `GET /projects/available`/`GET /tasks`/`GET /issues` already document
 * for themselves: browsing DevTunnel's tool catalog is not an admin
 * action.
 *
 * Response body is the raw `OpenSourceToolSummary[]` array — NOT wrapped
 * in the `{ data: ... }` envelope (src/lib/response.ts) — matching the
 * already-shipped frontend contract (`getOpenSourceTools` parses the body
 * directly as `OpenSourceToolSummary[]`), the same documented exception
 * every other list route in this backend uses. Error responses still use
 * the standard `{ error: { code, message, requestId } }` envelope.
 */
openSourceTools.get("/opensource-tools/available", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Cheap indexed-table read, same generous per-minute budget
  // `GET /projects/available`/`GET /tasks` apply to their own list reads.
  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-available-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const list = await listAvailableOpenSourceTools(supabase);
    return c.json(list, 200);
  } catch (err) {
    logger.error("opensource_tools_available_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load open source tools right now");
  }
});