import { Hono } from "hono";
import type { Env, Variables } from "../../types";
import { adminAuth } from "./auth";
import { adminActivity } from "./activity";
import { adminProjects } from "./projects";
import { adminTasks } from "./tasks";
import { adminNewIssues } from "./newIssues";
import { adminProjectOnboarding } from "../projectOnboarding";
import { adminTaskOnboarding } from "../taskOnboarding";
import { adminOpenSourceToolOnboarding } from "../opensourceToolOnboarding";

/**
 * Admin Backend router (devtunnel_workflow.txt section 43): mounted at
 * `/admin` in src/index.ts. Every route under here requires both
 * `requireAuth` (admin authentication) and `requireAdminRole` (admin
 * authorization), and most also declare a specific RBAC permission via
 * `requirePermission` (src/middleware/adminAuth.ts, src/lib/rbac.ts) —
 * enforced per-route, not by any check at this aggregation layer, so a
 * route can never accidentally end up unprotected by being mounted here.
 *
 * `/admin/auth`, `/admin/activity`, `/admin/projects`,
 * `/admin/projects/onboarding`, `/admin/tasks`, `/admin/tasks/onboarding`,
 * and `/admin/new-issues` exist so far. `/admin/projects` and
 * `/admin/projects/onboarding` (separate routers) are independent —
 * active projects vs. in-progress onboarding drafts — and Hono's router
 * matches the literal `onboarding` path segment ahead of
 * `/admin/projects/:id`'s dynamic segment regardless of mount order, so
 * `GET /admin/projects/onboarding/...` can never be swallowed by the
 * `:id` route below. `/admin/tasks` (this module) and
 * `/admin/tasks/onboarding` (src/routes/taskOnboarding.ts) are the same
 * shape one level up — mounted as plain siblings below, with the same
 * literal-segment-before-`:id` guarantee keeping
 * `GET /admin/tasks/onboarding/...` from ever being swallowed by
 * `/admin/tasks/:id`. `/admin/opensource-tools/onboarding`
 * (src/routes/opensourceToolOnboarding.ts) is mounted the same way —
 * there is no plain `/admin/opensource-tools` sibling yet (no "list/edit
 * an already-published tool" admin screen exists), so this mount point
 * only ever sees the six onboarding-wizard routes (rbac.ts's route map,
 * lines 54–60); it becomes a sibling of a future `/admin/opensource-tools`
 * the same way `/admin/tasks/onboarding` already is of `/admin/tasks`.
 * `/admin/new-issues` (src/routes/admin/newIssues.ts)
 * is its own top-level sibling rather than nested under `/admin/tasks` —
 * admin_workflow.txt section 16's own "Backend" list names the API route
 * as flat `GET /admin/new-issues` (the `/admin/tasks/new-issues` name in
 * that same section is the recommended *frontend page* URL, a separate
 * decision — see devtunnel-frontend's page at
 * `src/app/admin/(protected)/tasks/new-issues/page.tsx`), and this mount
 * point matches the already-shipped
 * `lib/admin/new-issues/api.ts`/`client-api.ts` contract exactly. Future
 * admin modules (`/admin/github`, ...) get their own file in this
 * directory and are mounted here the same way.
 */
export const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.route("/auth", adminAuth);
admin.route("/activity", adminActivity);
admin.route("/projects", adminProjects);
admin.route("/projects/onboarding", adminProjectOnboarding);
admin.route("/tasks", adminTasks);
admin.route("/tasks/onboarding", adminTaskOnboarding);
admin.route("/opensource-tools/onboarding", adminOpenSourceToolOnboarding);
admin.route("/new-issues", adminNewIssues);