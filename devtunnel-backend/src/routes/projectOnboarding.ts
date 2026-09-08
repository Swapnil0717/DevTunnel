// devtunnel-backend/src/routes/projectOnboarding.ts

import { Hono } from "hono";
import { z } from "zod";
import { getEnv } from "../config/env";
import { recordAdminAudit } from "../db/adminAudit";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { ProjectOnboardingError, saveRepositoryImport, toOnboardingDraft, saveDescription, saveTechStack, getDraftForAdmin, markPreviewCompleted, computeValidation, saveValidationResult, completeOnboarding } from "../db/projectOnboarding";
import { GitHubRepoError, parseGithubRepoUrl, fetchRepositoryMetadata, fetchRepositoryContributors, fetchRepositoryReadme, fetchRepositoryLanguages } from "../lib/githubRepo";
import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { getSupabase } from "../lib/supabase";
import { detectTechStack } from "../lib/techStack";
import { requireAdminRole, requirePermission } from "../middleware/adminAuth";
import { requireAuth } from "../middleware/auth";
import { Env, Variables } from "../types";


/**
 * Admin — Project Onboarding wizard (admin_workflow.txt section 6, backend
 * routes per section 22's "Project onboarding" group). Every route here
 * requires admin authentication + role (mounted the same way as every
 * other admin module — see src/routes/admin/index.ts) plus the
 * `admin:projects:write`/`admin:projects:read` RBAC permission that
 * src/lib/rbac.ts already reserves for project routes.
 *
 * Response bodies for the six routes below intentionally return the
 * `ProjectOnboardingDraft` / `ProjectOnboardingValidationResult` /
 * `CreatedProject` object directly — NOT wrapped in the `{ data: ... }`
 * envelope used elsewhere in this backend (src/lib/response.ts) —
 * because they must match, field for field, the already-implemented
 * frontend contract in
 * devtunnel-frontend/src/lib/admin/project-onboarding/api.ts, which
 * parses each response body directly as that type. Error responses still
 * use the standard `{ error: { code, message, requestId } }` envelope
 * (src/lib/response.ts) — the frontend only inspects `res.ok`/`res.status`
 * on failure, never the error body shape, so this doesn't create two
 * incompatible conventions for the same caller.
 */
export const adminProjectOnboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

const uuidSchema = z.string().uuid("Invalid onboarding draft id");

function mapOnboardingError(c: Parameters<typeof errorResponse>[0], err: ProjectOnboardingError) {
  switch (err.code) {
    case "not_found":
      return errorResponse(c, 404, "onboarding_draft_not_found", err.message);
    case "already_completed":
      return errorResponse(c, 409, "onboarding_already_completed", err.message);
    case "repository_already_onboarded":
      return errorResponse(c, 409, "repository_already_onboarded", err.message);
    case "step_incomplete":
      return errorResponse(c, 422, "onboarding_step_incomplete", err.message);
    default:
      return errorResponse(c, 409, "onboarding_conflict", err.message);
  }
}

function mapGithubError(c: Parameters<typeof errorResponse>[0], err: GitHubRepoError) {
  switch (err.reason) {
    case "not_found":
      return errorResponse(c, 404, "repository_not_found", err.message);
    case "rate_limited":
      return errorResponse(c, 429, "github_rate_limited", err.message);
    case "invalid_url":
      return errorResponse(c, 400, "invalid_repository_url", err.message);
    case "unauthorized":
      return errorResponse(c, 401, "github_reauth_required", err.message);
    default:
      return errorResponse(c, 502, "github_unavailable", err.message);
  }
}

/* ---------------------------------------------------------------------- *
 * Step 1 — POST /admin/projects/onboarding/repository
 * ---------------------------------------------------------------------- */

const importRepositorySchema = z.object({
  repositoryUrl: z.string().trim().min(1).max(500),
  draftId: z.string().uuid().optional(),
});

adminProjectOnboarding.post(
  "/repository",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-repository",
      limit: 20,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = importRepositorySchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const parsedRepo = parseGithubRepoUrl(bodyResult.data.repositoryUrl);
    if (!parsedRepo) {
      return errorResponse(
        c,
        400,
        "invalid_repository_url",
        "Enter a valid GitHub repository URL (e.g. https://github.com/owner/repository)",
      );
    }

    try {
      const supabase = getSupabase(env);
      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);

      const metadata = await fetchRepositoryMetadata(accessToken, parsedRepo.owner, parsedRepo.repo);
      const [contributors, readme] = await Promise.all([
        fetchRepositoryContributors(accessToken, parsedRepo.owner, parsedRepo.repo),
        fetchRepositoryReadme(accessToken, parsedRepo.owner, parsedRepo.repo),
      ]);

      const isNewDraft = !bodyResult.data.draftId;
      const row = await saveRepositoryImport(supabase, admin.id, bodyResult.data.draftId, {
        repositoryUrl: bodyResult.data.repositoryUrl,
        owner: parsedRepo.owner,
        repoName: metadata.name,
        fullName: metadata.fullName,
        githubDescription: metadata.description,
        readme,
        defaultBranch: metadata.defaultBranch,
        primaryLanguage: metadata.primaryLanguage,
        stars: metadata.stars,
        forks: metadata.forks,
        openIssues: metadata.openIssues,
        author: metadata.author,
        contributors,
        // A successful, validated metadata fetch is this codebase's only
        // signal of repository access (see src/lib/githubRepo.ts's
        // module comment) — there is no separate GitHub App installation
        // check to run here.
        hasGithubAppAccess: true,
      });

      return c.json(toOnboardingDraft(row), isNewDraft ? 201 : 200);
    } catch (err) {
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      if (err instanceof ProjectOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_onboarding_repository_import_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't import the repository right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 2 — PATCH /admin/projects/onboarding/:id/description
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

adminProjectOnboarding.patch(
  "/:id/description",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-description",
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
      if (err instanceof ProjectOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_onboarding_description_save_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the project description right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 3 — POST /admin/projects/onboarding/:id/tech-stack
 * ---------------------------------------------------------------------- */

const techStackSchema = z.object({
  languages: z.array(z.string().min(1).max(60)).max(30),
  frontend: z.array(z.string().min(1).max(60)).max(30),
  backend: z.array(z.string().min(1).max(60)).max(30),
  frameworks: z.array(z.string().min(1).max(60)).max(30),
  databases: z.array(z.string().min(1).max(60)).max(30),
  libraries: z.array(z.string().min(1).max(60)).max(30),
  buildTools: z.array(z.string().min(1).max(60)).max(30),
  packageManager: z.string().min(1).max(60).nullable(),
});

const saveTechStackBodySchema = z.object({ techStack: techStackSchema });

adminProjectOnboarding.post(
  "/:id/tech-stack",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-tech-stack",
      limit: 20,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    // A body is only present when the admin is submitting a manual
    // correction (api.ts `saveTechStack`); a bare `POST` with no body
    // means "run auto-detection" (api.ts `detectTechStack`) — both share
    // this one endpoint per admin_workflow.txt's route map.
    const rawBody = await c.req.json().catch(() => null);
    const manualResult = rawBody !== null ? saveTechStackBodySchema.safeParse(rawBody) : null;
    if (rawBody !== null && !manualResult?.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        manualResult?.error.issues[0]?.message ?? "Invalid tech stack payload",
      );
    }

    try {
      const supabase = getSupabase(env);

      if (manualResult?.success) {
        const row = await saveTechStack(supabase, admin.id, idResult.data, manualResult.data.techStack);
        return c.json(toOnboardingDraft(row), 200);
      }

      const draft = await getDraftForAdmin(supabase, idResult.data, admin.id);
      if (!draft) return errorResponse(c, 404, "onboarding_draft_not_found", "Onboarding draft not found");
      if (draft.completed_project_id) {
        return errorResponse(
          c,
          409,
          "onboarding_already_completed",
          "This onboarding draft has already been completed",
        );
      }
      if (!draft.repository_completed || !draft.github_owner || !draft.github_repo_name) {
        return errorResponse(
          c,
          422,
          "onboarding_step_incomplete",
          "Import a GitHub repository before detecting the tech stack",
        );
      }

      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);

      let languageBytes: Record<string, number> = {};
      try {
        languageBytes = await fetchRepositoryLanguages(accessToken, draft.github_owner, draft.github_repo_name);
      } catch (err) {
        // Non-fatal — detection still proceeds using primary_language +
        // manifest inspection alone (rule 51: an external API failure
        // degrades gracefully rather than blocking the whole step).
        logger.warn("admin_onboarding_language_bytes_failed", {
          error: err instanceof Error ? err.message : String(err),
          requestId: c.get("requestId"),
        });
      }

      const detected = await detectTechStack(
        accessToken,
        draft.github_owner,
        draft.github_repo_name,
        draft.default_branch ?? "main",
        draft.primary_language,
        languageBytes,
      );

      const row = await saveTechStack(supabase, admin.id, idResult.data, detected);
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      if (err instanceof ProjectOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_onboarding_tech_stack_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't determine the project tech stack right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 4 — GET /admin/projects/onboarding/:id/preview
 * ---------------------------------------------------------------------- */

adminProjectOnboarding.get(
  "/:id/preview",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:read"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-preview",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const row = await markPreviewCompleted(supabase, admin.id, idResult.data);
      return c.json(toOnboardingDraft(row), 200);
    } catch (err) {
      if (err instanceof ProjectOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_onboarding_preview_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load the project preview right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 5 — POST /admin/projects/onboarding/:id/validate
 * ---------------------------------------------------------------------- */

adminProjectOnboarding.post(
  "/:id/validate",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-validate",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const draft = await getDraftForAdmin(supabase, idResult.data, admin.id);
      if (!draft) return errorResponse(c, 404, "onboarding_draft_not_found", "Onboarding draft not found");
      if (draft.completed_project_id) {
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
      logger.error("admin_onboarding_validate_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't validate the onboarding draft right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Section 7 — POST /admin/projects/onboarding/:id/complete
 * ---------------------------------------------------------------------- */

adminProjectOnboarding.post(
  "/:id/complete",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/admin/auth.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = uuidSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-onboarding-complete",
      limit: 10,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const project = await completeOnboarding(supabase, admin.id, idResult.data);

      // rule 96: audit important administrative actions. Best-effort —
      // must never fail a request that already succeeded (same posture
      // as src/middleware/adminAuth.ts's auditDenied).
      recordAdminAudit(supabase, {
        adminId: admin.id,
        action: "PROJECT_ONBOARDING_COMPLETED",
        resourceType: "project",
        resourceId: project.id,
        result: "SUCCESS",
        metadata: { draftId: idResult.data, slug: project.slug },
      }).catch((auditErr) =>
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        }),
      );

      return c.json(project, 201);
    } catch (err) {
      if (err instanceof ProjectOnboardingError) return mapOnboardingError(c, err);
      logger.error("admin_onboarding_complete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't create the project right now");
    }
  },
);