// devtunnel-backend/src/routes/admin/ai.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import { recordAdminAudit } from "../../db/adminAudit";
import {
  runDailyDiscovery,
  runProjectDiscoveryOnly,
  runToolDiscoveryOnly,
  runTaskDiscoveryOnly,
  type StepReporter,
} from "../../lib/aiDiscoveryAgent";
import type { AiDiscoveryRunSummary } from "../../types";
import {
  getGroqQuotaSnapshot,
  getPhaseBudgetShares,
  setPhaseBudgetShares,
  InvalidPhaseBudgetSharesError,
  type DiscoveryPhase,
} from "../../lib/groqQuota";
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

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

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

/**
 * Read-only snapshot of the shared Groq request/token budget
 * (src/lib/groqQuota.ts) — how many requests and tokens are left this
 * minute and today, independent of any particular discovery run. Backs
 * the quota panel shown on every AI admin page. Never reserves or spends
 * budget — safe to poll freely.
 */
adminAi.get("/groq-quota", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const snapshot = await getGroqQuotaSnapshot(c.env.RATE_LIMIT_KV);
  return c.json(snapshot);
});

/**
 * Custom budget setter: lets an admin re-slice the shared daily Groq
 * budget across the three discovery phases (default 25% projects / 25%
 * tools / 50% tasks — groqQuota.ts DEFAULT_PHASE_BUDGET_SHARE) instead of
 * being stuck with that hardcoded split. `GET` reads the current split as
 * whole percentages; `PUT` replaces it. Takes effect on the very next
 * Groq call — it re-slices whatever budget is LEFT today, not what's
 * already been spent, and never resets any daily counters itself.
 */
const budgetSharesSchema = z.object({
  projects: z.number().min(0).max(100),
  tools: z.number().min(0).max(100),
  tasks: z.number().min(0).max(100),
});

function sharesToPercentages(shares: Record<DiscoveryPhase, number>): { projects: number; tools: number; tasks: number } {
  return {
    projects: Math.round(shares.projects * 100),
    tools: Math.round(shares.tools * 100),
    tasks: Math.round(shares.tasks * 100),
  };
}

adminAi.get("/budget", requireAuth, requireAdminRole, requirePermission("admin:ai:read"), async (c) => {
  const shares = await getPhaseBudgetShares(c.env.RATE_LIMIT_KV);
  return c.json(sharesToPercentages(shares));
});

adminAi.put("/budget", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = budgetSharesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", "Provide projects/tools/tasks percentages (0-100)");
  }

  const user = c.get("user");
  const env = getEnv(c.env);
  const requested = parsed.data;

  try {
    const saved = await setPhaseBudgetShares(c.env.RATE_LIMIT_KV, {
      projects: requested.projects / 100,
      tools: requested.tools / 100,
      tasks: requested.tasks / 100,
    });
    await recordAdminAudit(getSupabase(env), {
      adminId: user.id,
      action: "AI_DISCOVERY_BUDGET_UPDATED",
      resourceType: "ai_discovery",
      resourceId: null,
      result: "SUCCESS",
      metadata: requested,
    });
    return c.json(sharesToPercentages(saved));
  } catch (err) {
    if (err instanceof InvalidPhaseBudgetSharesError) {
      return errorResponse(c, 400, "invalid_shares", err.message);
    }
    logger.error("ai_discovery_budget_update_failed", { error: extractErrorMessage(err) });
    return errorResponse(c, 500, "internal_error", "Failed to update the budget split");
  }
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

adminAi.post("/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  try {
    const summary = await runDailyDiscovery(env, c.env.RATE_LIMIT_KV);
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
 * Streams live progress for a single-item AI discovery run as
 * Server-Sent Events, so the admin UI can show every step being carried
 * out in real time instead of just spinning until a final JSON response
 * arrives. Event shapes (all `data:` payloads are JSON):
 *   - "step": { message: string } — one human-readable progress line.
 *   - "done": AiDiscoveryRunSummary — the final result (stream ends after this).
 *   - "error": { message: string } — the run failed (stream ends after this).
 *
 * `runOne` is called with `limit = 1` by each route below, so every
 * button click adds exactly one project / tool / issue at a time.
 */
function streamDiscoveryRun(
  c: any,
  kind: "projects" | "tools" | "tasks",
  runOne: (env: ReturnType<typeof getEnv>, kv: KVNamespace, onStep: StepReporter) => Promise<AiDiscoveryRunSummary>,
  auditAction: string,
) {
  const env = getEnv(c.env);
  const user = c.get("user");

  return streamSSE(c, async (stream) => {
    let stepIndex = 0;
    const onStep: StepReporter = (message) => {
      stepIndex += 1;
      // Errors from writeSSE (client disconnected mid-run) are swallowed
      // deliberately — the discovery work itself must keep running to
      // completion regardless of whether anyone is still listening.
      void stream.writeSSE({ event: "step", data: JSON.stringify({ message }), id: String(stepIndex) }).catch(() => {});
    };

    try {
      const summary = await runOne(env, c.env.RATE_LIMIT_KV, onStep);
      await recordAdminAudit(getSupabase(env), {
        adminId: user.id,
        action: auditAction,
        resourceType: "ai_discovery",
        resourceId: null,
        result: "SUCCESS",
        metadata: summary as unknown as Record<string, unknown>,
      });
      await stream.writeSSE({ event: "done", data: JSON.stringify(summary) });
    } catch (err) {
      logger.error(`ai_discovery_manual_run_${kind}_failed`, { error: extractErrorMessage(err) });
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "Discovery run failed" }) });
    }
  });
}

adminAi.post("/projects/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  streamDiscoveryRun(
    c,
    "projects",
    (env, kv, onStep) => runProjectDiscoveryOnly(env, kv, onStep, 1),
    "AI_DISCOVERY_MANUAL_RUN_PROJECTS",
  ),
);

adminAi.post("/tools/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  streamDiscoveryRun(
    c,
    "tools",
    (env, kv, onStep) => runToolDiscoveryOnly(env, kv, onStep, 1),
    "AI_DISCOVERY_MANUAL_RUN_TOOLS",
  ),
);

adminAi.post("/tasks/run", requireAuth, requireAdminRole, requirePermission("admin:ai:write"), (c) =>
  streamDiscoveryRun(
    c,
    "tasks",
    (env, kv, onStep) => runTaskDiscoveryOnly(env, kv, onStep, 1),
    "AI_DISCOVERY_MANUAL_RUN_TASKS",
  ),
);