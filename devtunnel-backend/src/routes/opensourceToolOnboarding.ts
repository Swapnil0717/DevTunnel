// devtunnel-backend/src/routes/opensourceToolOnboarding.ts

import { Hono } from "hono";
import { z } from "zod";
import { getEnv } from "../config/env";
import { recordAdminAudit } from "../db/adminAudit";
import {
  ToolOnboardingError,
  saveUrlImport,
  toOnboardingDraft,
  saveDescription,
  saveLabels,
  saveSetupGuide,
  markPreviewCompleted,
  getDraftForAdmin,
  computeValidation,
  saveValidationResult,
  completeOnboarding,
} from "../db/opensourceToolOnboarding";

import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { getSupabase } from "../lib/supabase";
import { ToolSourceError } from "../lib/toolSource";
import { requireAdminRole, requirePermission } from "../middleware/adminAuth";
import { requireAuth } from "../middleware/auth";
import { Env, Variables } from "../types";

/**
 * Admin — Open Source Tool Onboarding wizard
 * (devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/,
 * `/admin/opensource-tools/new`). Every route here requires admin
 * authentication + role (mounted the same way as every other admin
 * module — see src/routes/admin/index.ts) plus the
 * `admin:opensource-tools:write`/`admin:opensource-tools:read` RBAC
 * permission src/lib/rbac.ts reserves for this route group (see its
 * route map comment, lines 54–60).
 *
 * Response bodies for the six routes below intentionally return the
 * `ToolOnboardingDraft` / `ToolOnboardingValidationResult` /
 * `CreatedOpenSourceTool` object directly — NOT wrapped in the
 * `{ data: ... }` envelope used elsewhere in this backend
 * (src/lib/response.ts) — because they must match, field for field, the
 * already-implemented frontend contract in
 * devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/api.ts,
 * which parses each response body directly as that type. Error
 * responses still use the standard `{ error: { code, message,
 * requestId } }` envelope (src/lib/response.ts) — the frontend only
 * inspects `res.ok`/`res.status` on failure, never the error body
 * shape, so this doesn't create two incompatible conventions for the
 * same caller. Mirrors src/routes/projectOnboarding.ts's own doc
 * comment, field for field.
 */
export const adminOpenSourceToolOnboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

const uuidSchema = z.string().uuid("Invalid onboarding draft id");

function mapOnboardingError(c: Parameters<typeof errorResponse>[0], err: ToolOnboardingError) {
  switch (err.code) {
    case "not_found":
      return errorResponse(c, 404, "onboarding_draft_not_found", err.message);
    case "already_completed":
      return errorResponse(c, 409, "onboarding_already_completed", err.message);
    case "tool_already_onboarded":
      return errorResponse(c, 409, "tool_already_onboarded", err.message);
    case "step_incomplete":
      return errorResponse(c, 422, "onboarding_step_incomplete", err.message);
    default:
      return errorResponse(c, 409, "onboarding_conflict", err.message);
  }
}

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

/* ---------------------------------------------------------------------- *
 * Step 1 — POST /admin/opensource-tools/onboarding/url
 * ---------------------------------------------------------------------- */

const importUrlSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  draftId: z.string().uuid().optional(),
});

adminOpenSourceToolOnboarding.post(
  "/url",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-url",
      limit: 20,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = importUrlSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);
      const resolved = await resolveToolSource(bodyResult.data.url);

      const isNewDraft = !bodyResult.data.draftId;
      const row = await saveUrlImport(supabase, admin.id, bodyResult.data.draftId, {
        url: resolved.url,
        name: resolved.name,
        fetchedDescription: resolved.fetchedDescription,
        readme: resolved.readme,
        primaryLanguage: resolved.primaryLanguage,
      });

      return c.json(toOnboardingDraft(row), isNewDraft ? 201 : 200);
    } catch (err) {
      if (err instanceof ToolSourceError) return mapToolSourceError(c, err);
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_url_import_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't import that tool URL right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 2 — PATCH /admin/opensource-tools/onboarding/:id/description
 * ---------------------------------------------------------------------- */

const descriptionSchema = z
  .object({
    choice: z.enum(["EXISTING", "CUSTOM"]),
    customDescription: z.string().trim().max(20_000).nullable().optional(),
  })
  .refine((val) => val.choice !== "CUSTOM" || !!val.customDescription?.trim(), {
    message: "Custom description is required when choosing a custom description",
    path: ["customDescription"],
  });

adminOpenSourceToolOnboarding.patch(
  "/:id/description",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-description",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = descriptionSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);
      const row = await saveDescription(
        supabase,
        admin.id,
        idResult.data,
        bodyResult.data.choice,
        bodyResult.data.customDescription ?? null,
      );
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_description_save_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the tool description right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 3 — PATCH /admin/opensource-tools/onboarding/:id/labels
 * ---------------------------------------------------------------------- */

const labelsSchema = z.object({
  values: z.array(z.string().trim().min(1).max(60)).max(30),
});

adminOpenSourceToolOnboarding.patch(
  "/:id/labels",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-labels",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = labelsSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);
      const row = await saveLabels(supabase, admin.id, idResult.data, bodyResult.data.values);
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_labels_save_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the tool labels right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 4 — PATCH /admin/opensource-tools/onboarding/:id/setup-guide
 * ---------------------------------------------------------------------- */

const setupGuideSchema = z.object({
  content: z.string().max(50_000),
});

adminOpenSourceToolOnboarding.patch(
  "/:id/setup-guide",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-setup-guide",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = setupGuideSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);
      const row = await saveSetupGuide(supabase, admin.id, idResult.data, bodyResult.data.content);
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_setup_guide_save_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the setup & usage guide right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 5 — GET /admin/opensource-tools/onboarding/:id/preview
 * ---------------------------------------------------------------------- */

adminOpenSourceToolOnboarding.get(
  "/:id/preview",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:read"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-preview",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const row = await markPreviewCompleted(supabase, admin.id, idResult.data);
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_preview_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load the tool preview right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * POST /admin/opensource-tools/onboarding/:id/validate
 * ---------------------------------------------------------------------- */

adminOpenSourceToolOnboarding.post(
  "/:id/validate",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-validate",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const draft = await getDraftForAdmin(supabase, idResult.data, admin.id);
      if (!draft) return errorResponse(c, 404, "onboarding_draft_not_found", "Onboarding draft not found");
      if (draft.completed_tool_id) {
        return errorResponse(
          c,
          409,
          "onboarding_already_completed",
          "This onboarding draft has already been completed",
        );
      }

      const result = computeValidation(draft);
      await saveValidationResult(supabase, admin.id, idResult.data, result.valid);
      return c.json(result, 200);
    } catch (err) {
      logger.error("admin_tool_onboarding_validate_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't validate the onboarding draft right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * POST /admin/opensource-tools/onboarding/:id/complete
 * ---------------------------------------------------------------------- */

adminOpenSourceToolOnboarding.post(
  "/:id/complete",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:opensource-tools:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tool-onboarding-complete",
      limit: 10,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const tool = await completeOnboarding(supabase, admin.id, idResult.data);

      // rule 96: audit important administrative actions. Best-effort —
      // must never fail a request that already succeeded (same posture
      // as src/middleware/adminAuth.ts's auditDenied and
      // src/routes/projectOnboarding.ts's own `/complete` route).
      recordAdminAudit(supabase, {
        adminId: admin.id,
        action: "OPENSOURCE_TOOL_ONBOARDING_COMPLETED",
        resourceType: "opensource_tool",
        resourceId: tool.id,
        result: "SUCCESS",
        metadata: { draftId: idResult.data, slug: tool.slug },
      }).catch((auditErr) =>
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        }),
      );

      return c.json(tool, 201);
    } catch (err) {
      if (err instanceof ToolOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_tool_onboarding_complete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't create the tool right now");
    }
  },
);