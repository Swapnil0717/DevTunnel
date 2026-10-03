import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import { listAdminBugReports } from "../../db/bugReports";

/**
 * Admin — bug reports.
 *
 *  GET /admin/bug-reports   newest first, `?limit=` (1–100, default 50) and
 *                           `?before=` (a `nextCursor` from the previous page)
 *
 * Read-only: reports are never edited or deleted from the admin side.
 *
 * Auth: `requireAuth` -> `requireAdminRole` -> `requirePermission` (in that
 * order, like every other admin module). New permission in src/lib/rbac.ts:
 * `admin:bug-reports:read`.
 *
 * Wire format: camelCase JSON, `{ data: { reports, nextCursor } }` on success,
 * the standard `{ error: { code, message, requestId } }` on failure. The text
 * is written by visitors, so the frontend must render it as plain text.
 */
export const adminBugReports = new Hono<{ Bindings: Env; Variables: Variables }>();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

adminBugReports.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:bug-reports:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-bug-reports-list",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests.");
    }

    const parsed = listQuerySchema.safeParse({
      limit: c.req.query("limit"),
      before: c.req.query("before") || undefined,
    });
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        "invalid_query",
        parsed.error.issues[0]?.message ?? "Invalid query parameters",
      );
    }

    try {
      const supabase = getSupabase(env);
      const { reports, nextCursor } = await listAdminBugReports(supabase, {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
      });
      return c.json({ data: { reports, nextCursor } }, 200);
    } catch (err) {
      logger.error("admin_bug_reports_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load bug reports right now");
    }
  },
);
