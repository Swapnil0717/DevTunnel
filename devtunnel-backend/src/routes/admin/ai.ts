import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import { recordAdminAudit } from "../../db/adminAudit";
import { runDailyDiscovery, runProjectDiscoveryOnly, runToolDiscoveryOnly, runTaskDiscoveryOnly } from "../../lib/aiDiscoveryAgent";
import {
  approveDiscoveredProject,
  approveDiscoveredTask,
  approveDiscoveredTool,
  getConfirmationQueue,
  getTodayCounters,
  listDiscoveredProjects,
  listDiscoveredTasks,
  listDiscoveredTools,
  rejectDiscoveredItem,
} from "../../db/aiDiscovery";

/**
 * Supabase's `rpc()` rejects with a `PostgrestError`-shaped plain object
 * (`{ message, code, details, hint }`), not a JS `Error` instance — so
 * `err instanceof Error` is false for every Postgres exception raised
 * from our approve_ai_discovered_* functions (AI_PROJECT_NOT_FOUND,
 * AI_PROJECT_ALREADY_REVIEWED, etc). Without this, `String(err)` on a
 * plain object degrades to the useless literal "[object Object]",
 * which breaks both the substring checks below (every case falls
 * through to a generic 500) and the log line's value for debugging.
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

/**
 * Admin — AI Discovery. RBAC permissions `admin:ai:read` / `admin:ai:write`
 * (src/lib/rbac.ts). Mounted at `/admin/ai` in src/routes/admin/index.ts.
 * Backs the already-shipped placeholder pages at
 * devtunnel-frontend/src/app/admin/(protected)/ai/{projects,tasks,tools,confirmation}.
 */
export const adminAi = new Hono<{ Bindings: Env; Variables: Variables }>();

const statusQuery = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().default("PENDING"),
});
const idParam = z.object({ id: z.string().uuid() });

adminAi.get("/status", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const counters = await getTodayCounters(supabase);
  return c.json(counters);
});

adminAi.get("/projects", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const parsed = statusQuery.safeParse(c.req.query());
  if (!parsed.success) return errorResponse(c, 400, "invalid_query", "Invalid status");
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const projects = await listDiscoveredProjects(supabase, parsed.data.status);
  return c.json(projects);
});

adminAi.get("/tools", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const parsed = statusQuery.safeParse(c.req.query());
  if (!parsed.success) return errorResponse(c, 400, "invalid_query", "Invalid status");
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const tools = await listDiscoveredTools(supabase, parsed.data.status);
  return c.json(tools);
});

adminAi.get("/tasks", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const parsed = statusQuery.safeParse(c.req.query());
  if (!parsed.success) return errorResponse(c, 400, "invalid_query", "Invalid status");
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const tasks = await listDiscoveredTasks(supabase, parsed.data.status);
  return c.json(tasks);
});

adminAi.get("/confirmation", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const queue = await getConfirmationQueue(supabase);
  return c.json(queue);
});

async function handleApprove(
  c: any,
  kind: "projects" | "tools" | "tasks",
  approveFn: (supabase: any, id: string, adminId: string) => Promise<unknown>,
) {
  const parsedId = idParam.safeParse(c.req.param());
  if (!parsedId.success) return errorResponse(c, 400, "invalid_id", "Invalid id");
  const user = c.get("user");
  const env = getEnv(c.env);
  const supabase = getSupabase(env);

  try {
    const result = await approveFn(supabase, parsedId.data.id, user.id);
    await recordAdminAudit(supabase, {
      adminId: user.id,
      action: `AI_${kind.slice(0, -1).toUpperCase()}_APPROVED`,
      resourceType: kind,
      resourceId: parsedId.data.id,
      result: "SUCCESS",
      metadata: {},
    });
    return c.json(result);
  } catch (err) {
    const message = extractErrorMessage(err);
    logger.error("ai_discovery_approve_failed", { kind, id: parsedId.data.id, error: message });
    if (message.includes("NOT_FOUND")) return errorResponse(c, 404, "not_found", "Not found");
    if (message.includes("ALREADY_REVIEWED") || message.includes("ALREADY_ONBOARDED") || message.includes("ALREADY_A_TASK")) {
      return errorResponse(c, 409, "conflict", "Already reviewed or already exists");
    }
    return errorResponse(c, 500, "internal_error", "Failed to approve");
  }
}

async function handleReject(c: any, table: "ai_discovered_projects" | "ai_discovered_tools" | "ai_discovered_tasks") {
  const parsedId = idParam.safeParse(c.req.param());
  if (!parsedId.success) return errorResponse(c, 400, "invalid_id", "Invalid id");
  const user = c.get("user");
  const env = getEnv(c.env);
  const supabase = getSupabase(env);

  try {
    await rejectDiscoveredItem(supabase, table, parsedId.data.id, user.id);
    await recordAdminAudit(supabase, {
      adminId: user.id,
      action: "AI_ITEM_REJECTED",
      resourceType: table,
      resourceId: parsedId.data.id,
      result: "SUCCESS",
      metadata: {},
    });
    return c.json({ id: parsedId.data.id, status: "REJECTED" });
  } catch (err) {
    logger.error("ai_discovery_reject_failed", { table, id: parsedId.data.id, error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Failed to reject");
  }
}

adminAi.post("/projects/:id/approve", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleApprove(c, "projects", approveDiscoveredProject),
);
adminAi.post("/projects/:id/reject", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleReject(c, "ai_discovered_projects"),
);

adminAi.post("/tools/:id/approve", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleApprove(c, "tools", approveDiscoveredTool),
);
adminAi.post("/tools/:id/reject", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleReject(c, "ai_discovered_tools"),
);

adminAi.post("/tasks/:id/approve", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleApprove(c, "tasks", approveDiscoveredTask),
);
adminAi.post("/tasks/:id/reject", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  handleReject(c, "ai_discovered_tasks"),
);

/**
 * Manual trigger — same work the daily cron does (src/index.ts
 * `scheduled`), useful for testing or topping up quota without waiting
 * for 03:00 UTC. The daily counters make this safe to call repeatedly —
 * it only ever fills whatever's left of today's quota.
 */
adminAi.post("/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  try {
    const summary = await runDailyDiscovery(env);
    await recordAdminAudit(getSupabase(env), {
      adminId: user.id,
      action: "AI_DISCOVERY_MANUAL_RUN",
      resourceType: "ai_discovery",
      resourceId: null,
      result: "SUCCESS",
      metadata: summary as unknown as Record<string, unknown>,
    });
    return c.json(summary);
  } catch (err) {
    logger.error("ai_discovery_manual_run_failed", { error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Discovery run failed");
  }
});

/**
 * Scoped manual trigger — runs ONLY the project-discovery phase. Backs
 * the "Add AI projects" button on the AI Added Projects admin page.
 * Same quota/dedup guarantees as POST /admin/ai/run, just narrowed to
 * one phase.
 */
adminAi.post("/projects/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  try {
    const summary = await runProjectDiscoveryOnly(env);
    await recordAdminAudit(getSupabase(env), {
      adminId: user.id,
      action: "AI_DISCOVERY_MANUAL_RUN_PROJECTS",
      resourceType: "ai_discovery",
      resourceId: null,
      result: "SUCCESS",
      metadata: summary as unknown as Record<string, unknown>,
    });
    return c.json(summary);
  } catch (err) {
    logger.error("ai_discovery_manual_run_projects_failed", { error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Discovery run failed");
  }
});

/**
 * Scoped manual trigger — runs ONLY the tool-discovery phase. Backs the
 * "Add AI tools" button on the AI Added Tools admin page. Same
 * quota/dedup guarantees as POST /admin/ai/run, just narrowed to one
 * phase.
 */
adminAi.post("/tools/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  try {
    const summary = await runToolDiscoveryOnly(env);
    await recordAdminAudit(getSupabase(env), {
      adminId: user.id,
      action: "AI_DISCOVERY_MANUAL_RUN_TOOLS",
      resourceType: "ai_discovery",
      resourceId: null,
      result: "SUCCESS",
      metadata: summary as unknown as Record<string, unknown>,
    });
    return c.json(summary);
  } catch (err) {
    logger.error("ai_discovery_manual_run_tools_failed", { error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Discovery run failed");
  }
});

/**
 * Scoped manual trigger — runs ONLY the task-discovery phase (walks
 * every onboarded project's open issues one by one). Backs the "Add AI
 * tasks" button on the AI Added Tasks admin page. Same dedup
 * guarantees as POST /admin/ai/run, just narrowed to one phase.
 */
adminAi.post("/tasks/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  try {
    const summary = await runTaskDiscoveryOnly(env);
    await recordAdminAudit(getSupabase(env), {
      adminId: user.id,
      action: "AI_DISCOVERY_MANUAL_RUN_TASKS",
      resourceType: "ai_discovery",
      resourceId: null,
      result: "SUCCESS",
      metadata: summary as unknown as Record<string, unknown>,
    });
    return c.json(summary);
  } catch (err) {
    logger.error("ai_discovery_manual_run_tasks_failed", { error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Discovery run failed");
  }
});