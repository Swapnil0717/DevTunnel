import { Hono } from "hono";
import { z } from "zod";
import type { AdminToolUpdatePayload, Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import {
  AdminOpenSourceToolDeleteError,
  AdminOpenSourceToolRefreshError,
  AdminOpenSourceToolUpdateError,
  deleteAdminOpenSourceTool,
  getAdminOpenSourceToolById,
  getAdminOpenSourceToolDetailById,
  listAdminOpenSourceTools,
  refreshOpenSourceToolReadme,
  updateAdminOpenSourceTool,
} from "../../db/adminOpenSourceTools";
import { recordAdminAudit } from "../../db/adminAudit";
import { ToolSourceError } from "../../lib/toolSource";

/**
 * Admin — Open Source Tools (the already-published catalog, as opposed to
 * the six-step onboarding wizard). RBAC permissions
 * `admin:opensource-tools:read` / `admin:opensource-tools:write` /
 * `admin:opensource-tools:delete` (src/lib/rbac.ts) — reusing the
 * read/write pair the onboarding wizard already declared, plus a new
 * delete permission, same read/write/delete split `admin:projects:*`
 * uses. Mounted at `/admin/opensource-tools` in
 * src/routes/admin/index.ts, alongside (not instead of)
 * `/admin/opensource-tools/onboarding`
 * (src/routes/opensourceToolOnboarding.ts) — the two modules are
 * independent: onboarding drafts vs. already-published tools, same
 * relationship `/admin/tasks` has with `/admin/tasks/onboarding`. Hono's
 * router matches the literal `onboarding` path segment ahead of this
 * module's `/:id` dynamic segment regardless of mount order (see
 * src/routes/admin/index.ts's own comment), so
 * `GET /admin/opensource-tools/onboarding/...` can never be swallowed by
 * the `:id` route below.
 *
 * This module mirrors src/routes/admin/projects.ts's structure almost
 * line-for-line — same Zod validation style, same rate-limit/error/audit
 * conventions — just for `devtunnel.opensource_tools` (sql/017) instead
 * of `devtunnel.projects`.
 */
export const adminOpenSourceTools = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Query validation for `GET /admin/opensource-tools` (rules 14–15) — same
 * bounds `listQuerySchema` in projects.ts uses.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

const idSchema = z.string().uuid("Invalid open source tool id");

/**
 * Body validation for `PATCH /admin/opensource-tools/:id`. Mirrors
 * `updateProjectSchema`'s shape in projects.ts: at least one field
 * required via `.refine` (an empty `{}` body is a 400, never a silent
 * no-op — rule 17), and the same "custom description required when
 * choosing CUSTOM" `.refine` `updateDescriptionSchema` there applies.
 *
 * `labels` mirrors the onboarding wizard's own label validation
 * (src/routes/opensourceToolOnboarding.ts Step 3). `setupGuide` allows a
 * much larger cap than a plain description field — it's Markdown, same
 * reasoning `setup_guide_content`'s column comment in sql/017 gives for
 * why it's never derived from `readme`.
 */
const updateOpenSourceToolSchema = z
  .object({
    descriptionChoice: z.enum(["EXISTING", "CUSTOM"]).optional(),
    customDescription: z.string().trim().max(20_000).nullable().optional(),
    labels: z.array(z.string().min(1).max(80)).max(30).optional(),
    setupGuide: z.string().max(50_000).optional(),
  })
  .refine(
    (val) =>
      val.descriptionChoice !== undefined ||
      val.customDescription !== undefined ||
      val.labels !== undefined ||
      val.setupGuide !== undefined,
    { message: "Provide at least one field to update" },
  )
  .refine((val) => val.descriptionChoice !== "CUSTOM" || !!val.customDescription?.trim(), {
    message: "Custom description is required when choosing a custom description",
    path: ["customDescription"],
  });

/**
 * `GET /admin/opensource-tools`.
 *
 * Returns every published open source tool, newest first. The response
 * body is the raw `AdminToolSummary[]` array — NOT wrapped in the
 * `{ data: ... }` envelope (src/lib/response.ts) — to match the
 * already-shipped frontend contract in devtunnel-frontend/src/lib/admin/
 * opensource-tools/api.ts (`const data = (await res.json()) as
 * AdminToolSummary[]`), the same documented exception `GET
 * /admin/projects` already uses. Error responses still use the standard
 * `{ error: { code, message, requestId } }` envelope — the frontend only
 * branches on `res.ok`.
 *
 * Returns `[]` with a 200 when there are no tools — the frontend's
 * `status: "empty"` branch triggers on `data.length === 0` client-side,
 * so this never special-cases empty into a different status (rule 17).
 *
 * Keyset pagination cursor for the next page is returned via the
 * `X-Next-Cursor` response header, same convention `GET /admin/projects`
 * uses for the same reason (the body must stay a plain array).
 */
adminOpenSourceTools.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-opensource-tools-list",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const parsed = listQuerySchema.safeParse({
      limit: c.req.query("limit"),
      before: c.req.query("before"),
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
      const { tools, nextCursor } = await listAdminOpenSourceTools(supabase, {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
      });

      if (nextCursor) {
        c.header("X-Next-Cursor", nextCursor);
      }
      return c.json(tools, 200);
    } catch (err) {
      logger.error("admin_opensource_tools_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load open source tools right now");
    }
  },
);

/**
 * `GET /admin/opensource-tools/:id`.
 *
 * Backs the tool detail page — returns `AdminToolDetail` (src/types.ts),
 * matching the frontend's already-shipped contract in
 * devtunnel-frontend/src/lib/admin/opensource-tools/types.ts exactly.
 */
adminOpenSourceTools.get(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:read"),
  async (c) => {
    const env = getEnv(c.env);

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-opensource-tools-detail",
      limit: 120,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);
      const tool = await getAdminOpenSourceToolDetailById(supabase, idResult.data);
      if (!tool) {
        return errorResponse(c, 404, "opensource_tool_not_found", "Open source tool not found");
      }
      return c.json(tool, 200);
    } catch (err) {
      logger.error("admin_opensource_tool_detail_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load this tool right now");
    }
  },
);

/**
 * `PATCH /admin/opensource-tools/:id`.
 *
 * Backs the detail page's inline edit panel
 * (`EditOpenSourceToolDetailsPanel` / `updateAdminOpenSourceTool` in
 * devtunnel-frontend/src/lib/admin/opensource-tools/client-api.ts) — lets
 * an Admin correct the description/labels/setup-guide fields Steps 2–4 of
 * onboarding already hand them control over, after the tool is already
 * published. Every other field (source URL, fetched description, primary
 * language, README) is import-derived and has no writable path through
 * this endpoint — see `updateOpenSourceToolSchema` and
 * `AdminToolUpdatePayload` (src/types.ts) for exactly what is and isn't
 * accepted.
 *
 * Returns the full, freshly-read `AdminToolDetail` (not just the changed
 * fields) so the frontend can replace its local state directly from the
 * response without a second round-trip — same contract
 * `updateAdminOpenSourceTool` in client-api.ts already expects.
 */
adminOpenSourceTools.patch(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-opensource-tools-update",
      limit: 30,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const rawBody = await c.req.json().catch(() => null);
    const bodyResult = updateOpenSourceToolSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const supabase = getSupabase(env);

    const updatePayload: AdminToolUpdatePayload = {};
    if (bodyResult.data.descriptionChoice !== undefined) {
      updatePayload.descriptionChoice = bodyResult.data.descriptionChoice;
    }
    if (bodyResult.data.customDescription !== undefined) {
      updatePayload.customDescription = bodyResult.data.customDescription;
    }
    if (bodyResult.data.labels !== undefined) {
      updatePayload.labels = bodyResult.data.labels;
    }
    if (bodyResult.data.setupGuide !== undefined) {
      updatePayload.setupGuide = bodyResult.data.setupGuide;
    }

    try {
      const tool = await updateAdminOpenSourceTool(supabase, idResult.data, updatePayload);

      // Best-effort audit trail (rule 96). Only records which fields
      // changed and the chosen description source — never the free-text
      // `customDescription` or `setupGuide` body itself (rule 59; same
      // reasoning `projects.ts` already documents for not logging tech
      // stack/description text).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_OPENSOURCE_TOOL_UPDATED",
          resourceType: "opensource_tool",
          resourceId: tool.id,
          result: "SUCCESS",
          metadata: {
            slug: tool.slug,
            updatedFields: Object.keys(updatePayload),
            descriptionChoice: updatePayload.descriptionChoice ?? null,
          },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(tool, 200);
    } catch (err) {
      if (err instanceof AdminOpenSourceToolUpdateError) {
        return errorResponse(c, 404, "opensource_tool_not_found", "Open source tool not found");
      }

      logger.error("admin_opensource_tool_update_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_OPENSOURCE_TOOL_UPDATED",
          resourceType: "opensource_tool",
          resourceId: idResult.data,
          result: "FAILURE",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return errorResponse(c, 500, "internal_error", "Couldn't update this tool right now");
    }
  },
);

/**
 * Maps a `ToolSourceError` (src/lib/toolSource.ts) to the standard error
 * envelope — same mapping `src/routes/opensourceToolOnboarding.ts`
 * already uses for the same error type (rule 20).
 */
function mapToolSourceError(c: Parameters<typeof errorResponse>[0], err: ToolSourceError) {
  switch (err.reason) {
    case "not_found":
      return errorResponse(c, 404, "tool_source_not_found", err.message);
    case "invalid_url":
      return errorResponse(c, 400, "invalid_tool_url", err.message);
    case "unsupported_content":
      return errorResponse(c, 422, "tool_source_unsupported", err.message);
    default:
      return errorResponse(c, 502, "tool_source_unavailable", err.message);
  }
}

/**
 * `POST /admin/opensource-tools/:id/refresh-readme` — Tool Detail edit
 * panel's "Fetch latest README" action
 * (`EditOpenSourceToolDetailsPanel`). Re-pulls the README from the
 * tool's own `source_url` and overwrites the stored copy — everything
 * else onboarding Step 1 resolved (fetched description, primary
 * language) is untouched.
 *
 * Uses `requirePermission("admin:opensource-tools:write")` — same
 * permission `PATCH /admin/opensource-tools/:id` requires, since this is
 * still a write to the same row, just sourced from the tool's URL
 * instead of the request body.
 */
adminOpenSourceTools.post(
  "/:id/refresh-readme",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-opensource-tools-refresh-readme",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const existing = await getAdminOpenSourceToolById(supabase, idResult.data);
      if (!existing) {
        return errorResponse(c, 404, "opensource_tool_not_found", "Open source tool not found");
      }

      const tool = await refreshOpenSourceToolReadme(supabase, idResult.data, existing.sourceUrl);

      // Best-effort audit trail (rule 96), same convention as
      // `PATCH /:id` above.
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_OPENSOURCE_TOOL_README_REFRESHED",
          resourceType: "opensource_tool",
          resourceId: tool.id,
          result: "SUCCESS",
          metadata: { slug: tool.slug },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(tool, 200);
    } catch (err) {
      if (err instanceof ToolSourceError) return mapToolSourceError(c, err);
      if (err instanceof AdminOpenSourceToolRefreshError) {
        return errorResponse(c, 404, "opensource_tool_not_found", "Open source tool not found");
      }
      logger.error("admin_opensource_tool_refresh_readme_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't refresh the README right now");
    }
  },
);

/**
 * `DELETE /admin/opensource-tools/:id`.
 *
 * Hard-deletes the catalog row — see `deleteAdminOpenSourceTool`
 * (src/db/adminOpenSourceTools.ts) for why this tool is a plain physical
 * delete rather than the soft delete `DELETE /admin/projects/:id` uses.
 * The frontend's `deleteAdminOpenSourceTool` sends no request body (it
 * doesn't need a `reason` field the way `DELETE /admin/projects/:id`
 * does), so this endpoint doesn't parse one.
 *
 * Uses a dedicated `admin:opensource-tools:delete` permission
 * (src/lib/rbac.ts) rather than reusing `:write` — same reasoning
 * `admin:projects:delete` is already kept separate from
 * `admin:projects:write`: different blast radius, and a narrower admin
 * role could get one without the other later.
 *
 * There is no "already deleted" 409 the way `DELETE /admin/projects/:id`
 * has — a hard delete leaves no row behind to distinguish "already
 * deleted" from "never existed", so any missing row is a plain 404.
 */
adminOpenSourceTools.delete(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:delete"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    // Tighter than the read endpoints — a destructive action is rate
    // limited more aggressively (rule 43/85), same limit
    // `admin-projects-delete` uses.
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-opensource-tools-delete",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const result = await deleteAdminOpenSourceTool(supabase, idResult.data);

      // Best-effort audit trail (rule 96) — recorded even though the row
      // itself won't exist afterward, same as ADMIN_PROJECT_DELETED.
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_OPENSOURCE_TOOL_DELETED",
          resourceType: "opensource_tool",
          resourceId: result.id,
          result: "SUCCESS",
          metadata: { slug: result.slug, name: result.name },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(result, 200);
    } catch (err) {
      if (err instanceof AdminOpenSourceToolDeleteError) {
        return errorResponse(c, 404, "opensource_tool_not_found", "Open source tool not found");
      }

      logger.error("admin_opensource_tool_delete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_OPENSOURCE_TOOL_DELETED",
          resourceType: "opensource_tool",
          resourceId: idResult.data,
          result: "FAILURE",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return errorResponse(c, 500, "internal_error", "Couldn't delete this tool right now");
    }
  },
);