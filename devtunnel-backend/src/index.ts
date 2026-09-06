import { Hono } from "hono";
import type { Env, Variables } from "../../types";
import { adminActivity } from "./routes/admin/activity";
import { adminAuth } from "./routes/admin/auth";
import { adminProjectOnboarding } from "./routes/projectOnboarding";


/**
 * Admin Backend router (devtunnel_workflow.txt section 43 /
 * admin_workflow.txt): mounted at `/admin` in src/index.ts. Every route
 * under here requires both `requireAuth` (admin authentication) and
 * `requireAdminRole` (admin authorization), and most also declare a
 * specific RBAC permission via `requirePermission`
 * (src/middleware/adminAuth.ts, src/lib/rbac.ts) — enforced per-route,
 * not by any check at this aggregation layer, so a route can never
 * accidentally end up unprotected by being mounted here.
 *
 * `/admin/auth`, `/admin/activity`, and `/admin/projects/onboarding`
 * (admin_workflow.txt section 6 — Project Onboarding) exist so far.
 * Future admin modules (`/admin/projects`, `/admin/tasks`,
 * `/admin/github`, ...) get their own file in this directory and are
 * mounted here the same way.
 */
export const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.route("/auth", adminAuth);
admin.route("/activity", adminActivity);
admin.route("/projects/onboarding", adminProjectOnboarding);