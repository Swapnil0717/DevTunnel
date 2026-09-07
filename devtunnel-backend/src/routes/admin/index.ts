import { Hono } from "hono";
import type { Env, Variables } from "../../types";
import { adminAuth } from "./auth";
import { adminActivity } from "./activity";
import { adminProjects } from "./projects";
import { adminProjectOnboarding } from "../projectOnboarding";

/**
 * Admin Backend router (devtunnel_workflow.txt section 43): mounted at
 * `/admin` in src/index.ts. Every route under here requires both
 * `requireAuth` (admin authentication) and `requireAdminRole` (admin
 * authorization), and most also declare a specific RBAC permission via
 * `requirePermission` (src/middleware/adminAuth.ts, src/lib/rbac.ts) —
 * enforced per-route, not by any check at this aggregation layer, so a
 * route can never accidentally end up unprotected by being mounted here.
 *
 * `/admin/auth`, `/admin/activity`, `/admin/projects`, and
 * `/admin/projects/onboarding` exist so far. `/admin/projects` (this
 * module) and `/admin/projects/onboarding` (a separate router) are
 * independent — active projects vs. in-progress onboarding drafts — and
 * Hono's router matches the literal `onboarding` path segment ahead of
 * `/admin/projects/:id`'s dynamic segment regardless of mount order, so
 * `GET /admin/projects/onboarding/...` can never be swallowed by the
 * `:id` route below. Future admin modules (`/admin/tasks`, `/admin/github`,
 * ...) get their own file in this directory and are mounted here the same
 * way.
 */
export const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.route("/auth", adminAuth);
admin.route("/activity", adminActivity);
admin.route("/projects", adminProjects);
admin.route("/projects/onboarding", adminProjectOnboarding);