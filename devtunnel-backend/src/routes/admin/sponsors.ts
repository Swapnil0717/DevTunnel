import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import { recordAdminAudit, type AdminAuditResult } from "../../db/adminAudit";
import {
  DISPLAY_NAME_MAX_CHARS,
  MAX_SPONSOR_AMOUNT_PAISE,
  sanitizeDisplayName,
  sanitizeGithubUsername,
} from "../../lib/sponsorRules";
import { istMonthKey } from "../../db/sponsorsPublic";
import {
  ADMIN_SPONSOR_STATUSES,
  createManualSponsor,
  hideAdminSponsor,
  listAdminSponsors,
  updateAdminSponsor,
  upsertSponsorGoal,
  type AdminSponsorPatch,
} from "../../db/adminSponsors";

/**
 * Admin — Sponsors moderation.
 *
 *  GET    /admin/sponsors            list every row, filters ?status=&approved=, newest first
 *  POST   /admin/sponsors            add a MANUAL sponsor (paid outside Razorpay)
 *  PATCH  /admin/sponsors/:id        edit the moderation fields
 *  DELETE /admin/sponsors/:id        SOFT hide (hidden = true). There is no hard delete.
 *  PUT    /admin/sponsor-goal        set the goal for a month
 *
 * Two routers are exported because the goal lives at its own top-level path
 * (`/admin/sponsor-goal`); src/routes/admin/index.ts mounts both.
 *
 * Auth: every route mounts `requireAuth` -> `requireAdminRole` ->
 * `requirePermission(...)`, in that order, like every other admin module.
 * New RBAC permissions (src/lib/rbac.ts): `admin:sponsors:read` for the list,
 * `admin:sponsors:write` for everything that changes data.
 *
 * Wire format: camelCase JSON, `{ data: ... }` envelope on success, the
 * standard `{ error: { code, message, requestId } }` on failure.
 *
 * Privacy: the admin sees `razorpayPaymentId` and the amount. The table holds
 * no email / phone / card / UPI data, so none can be returned. Audit rows
 * record which fields changed and ids/flags, never names or usernames.
 *
 * No Workers KV and no Supabase calls beyond one per request (plus one
 * best-effort audit insert on writes). The public wall caches for 5 minutes
 * (src/routes/sponsors.ts), so an approval or goal change appears there
 * within about 5 minutes.
 */
export const adminSponsors = new Hono<{ Bindings: Env; Variables: Variables }>();
export const adminSponsorGoal = new Hono<{ Bindings: Env; Variables: Variables }>();

type AdminContext = Context<{ Bindings: Env; Variables: Variables }>;

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

const idSchema = z.string().uuid("Invalid sponsor id");

/** `?status=` (empty) behaves like the param being absent. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
  status: z.preprocess(emptyToUndefined, z.enum(ADMIN_SPONSOR_STATUSES).optional()),
  approved: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
  ),
});

/**
 * Display name: trimmed, at most 60 characters (the column's CHECK), then run
 * through the same sanitiser the webhook uses (control characters, angle
 * brackets, backticks and links removed). `null` or "" clears it. If the
 * input is non-empty but nothing usable survives, that is a 400, not a silent
 * clear.
 */
const displayNameSchema = z
  .string()
  .trim()
  .max(DISPLAY_NAME_MAX_CHARS, `displayName must be at most ${DISPLAY_NAME_MAX_CHARS} characters`)
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value === "") return null;
    const cleaned = sanitizeDisplayName(value);
    if (cleaned === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "displayName has no usable characters" });
      return z.NEVER;
    }
    return cleaned;
  });

/**
 * GitHub username: "octocat" or "@octocat". Validated with the webhook's own
 * rule (`sanitizeGithubUsername`, src/lib/sponsorRules.ts: 1-39 letters,
 * digits or single hyphens, no leading/trailing hyphen) but STRICTLY: a
 * profile URL or trailing text is rejected, not trimmed down to something
 * that might be a different real account. `null` or "" clears it.
 */
const githubUsernameSchema = z
  .string()
  .trim()
  .max(40, "githubUsername must be at most 39 characters")
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value === "") return null;
    const bare = value.replace(/^@/, "");
    const cleaned = sanitizeGithubUsername(bare);
    if (cleaned === null || cleaned !== bare) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "githubUsername must be a valid GitHub username (letters, digits and single hyphens, max 39)",
      });
      return z.NEVER;
    }
    return cleaned;
  });

/** `.strict()` rejects any field not listed, so only these can ever change. */
const patchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    githubUsername: githubUsernameSchema.optional(),
    showAmount: z.boolean().optional(),
    isAnonymous: z.boolean().optional(),
    approved: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });

/** Rupees with at most two decimals, e.g. 500 or 499.5 (not 499.999). */
const rupeesSchema = (label: string, maxPaise: number) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(maxPaise / 100, `${label} is too large`)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: `${label} can have at most 2 decimal places`,
    });

const createSchema = z
  .object({
    amountInr: rupeesSchema("amountInr", MAX_SPONSOR_AMOUNT_PAISE),
    displayName: displayNameSchema.optional(),
    githubUsername: githubUsernameSchema.optional(),
    isAnonymous: z.boolean().optional().default(false),
    showAmount: z.boolean().optional().default(false),
    /** A deliberate manual add is approved by default; send false to review it first. */
    approved: z.boolean().optional().default(true),
    /** ISO 8601 with offset, e.g. "2026-10-02T14:30:00+05:30". Defaults to now. Not more than a day ahead. */
    paidAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Date.parse(value) <= Date.now() + 86_400_000, {
        message: "paidAt can't be in the future",
      })
      .refine((value) => Date.parse(value) >= Date.parse("2020-01-01T00:00:00Z"), {
        message: "paidAt is too far in the past",
      })
      .optional(),
  })
  .strict();

const goalSchema = z
  .object({
    /** "YYYY-MM". Defaults to the current month in India time. */
    month: z
      .string()
      .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "month must look like 2026-10")
      .optional(),
    goalInr: rupeesSchema("goalInr", 2_000_000_000),
    note: z
      .string()
      .trim()
      .max(200, "note must be at most 200 characters")
      .nullable()
      .optional()
      .transform((value) => (value === "" ? null : value)),
  })
  .strict();

function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body";
  // "Unrecognized key(s) in object: 'x'" is clear enough; other issues read better with the field name.
  const field = issue.path.join(".");
  return field && issue.code !== "unrecognized_keys" ? `${field}: ${issue.message}` : issue.message;
}

/** `tier` is generated from `amount_paise`; say so instead of a generic "unrecognized key". */
function mentionsTier(body: unknown): boolean {
  return typeof body === "object" && body !== null && !Array.isArray(body) && "tier" in body;
}

const TIER_MESSAGE =
  "tier is derived from the amount (supporter < Rs 500, backer Rs 500-1,999, champion Rs 2,000+) and can't be edited";

/* ---------------------------------------------------------------------------
 * Audit (best-effort, rule 96): a failed audit write never fails the request.
 * ------------------------------------------------------------------------- */

async function audit(
  c: AdminContext,
  entry: {
    action: string;
    resourceType: string;
    resourceId: string | null;
    result: AdminAuditResult;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const user = c.get("user");
  if (!user) return;
  try {
    await recordAdminAudit(getSupabase(getEnv(c.env)), { adminId: user.id, ...entry });
  } catch (err) {
    logger.error("admin_audit_write_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ---------------------------------------------------------------------------
 * GET /admin/sponsors
 * ------------------------------------------------------------------------- */

/**
 * Response: `{ data: { sponsors: AdminSponsor[], nextCursor: string | null } }`
 * (type: src/db/adminSponsors.ts). The approval queue is
 * `?status=captured&approved=false`.
 */
adminSponsors.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:sponsors:read"),
  async (c) => {
    const withinLimit = await checkRateLimit(c, { bucket: "admin-sponsors-list", limit: 60, windowSeconds: 60 });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    const parsed = listQuerySchema.safeParse({
      limit: c.req.query("limit"),
      before: c.req.query("before"),
      status: c.req.query("status"),
      approved: c.req.query("approved"),
    });
    if (!parsed.success) {
      return errorResponse(c, 400, "invalid_query", validationMessage(parsed.error));
    }

    try {
      const page = await listAdminSponsors(getSupabase(getEnv(c.env)), {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
        status: parsed.data.status ?? null,
        approved: parsed.data.approved ?? null,
      });
      return c.json({ data: page }, 200);
    } catch (err) {
      logger.error("admin_sponsors_list_failed", { error: errorText(err), requestId: c.get("requestId") });
      return errorResponse(c, 500, "internal_error", "Couldn't load sponsors right now");
    }
  },
);

/* ---------------------------------------------------------------------------
 * POST /admin/sponsors  (manual sponsor)
 * ------------------------------------------------------------------------- */

/**
 * For someone who paid you directly (e.g. UPI). Creates a `source = 'manual'`,
 * `status = 'captured'` row, so it counts toward this month's total at once
 * and joins the wall as soon as it is approved (default: approved).
 * Response: 201 `{ data: { sponsor: AdminSponsor } }`.
 */
adminSponsors.post(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:sponsors:write"),
  async (c) => {
    const withinLimit = await checkRateLimit(c, { bucket: "admin-sponsors-create", limit: 30, windowSeconds: 60 });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    const rawBody = await c.req.json().catch(() => null);
    if (mentionsTier(rawBody)) return errorResponse(c, 400, "tier_not_editable", TIER_MESSAGE);

    const parsed = createSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(c, 400, "invalid_request", validationMessage(parsed.error));
    }
    const body = parsed.data;
    const amountPaise = Math.round(body.amountInr * 100);

    try {
      const sponsor = await createManualSponsor(getSupabase(getEnv(c.env)), {
        amountPaise,
        displayName: body.displayName ?? null,
        githubUsername: body.githubUsername ?? null,
        isAnonymous: body.isAnonymous,
        showAmount: body.showAmount,
        approved: body.approved,
        paidAt: new Date(body.paidAt ?? Date.now()).toISOString(),
      });

      await audit(c, {
        action: "ADMIN_SPONSOR_CREATED",
        resourceType: "sponsorship",
        resourceId: sponsor.id,
        result: "SUCCESS",
        metadata: {
          source: "manual",
          amountPaise: sponsor.amountPaise,
          tier: sponsor.tier,
          approved: sponsor.approved,
          isAnonymous: sponsor.isAnonymous,
          showAmount: sponsor.showAmount,
        },
      });
      return c.json({ data: { sponsor } }, 201);
    } catch (err) {
      logger.error("admin_sponsor_create_failed", { error: errorText(err), requestId: c.get("requestId") });
      await audit(c, {
        action: "ADMIN_SPONSOR_CREATED",
        resourceType: "sponsorship",
        resourceId: null,
        result: "FAILURE",
        metadata: { error: errorText(err) },
      });
      return errorResponse(c, 500, "internal_error", "Couldn't add this sponsor right now");
    }
  },
);

/* ---------------------------------------------------------------------------
 * PATCH /admin/sponsors/:id
 * ------------------------------------------------------------------------- */

/**
 * Edits displayName, githubUsername, showAmount, isAnonymous, approved,
 * hidden (and nothing else). `tier` is rejected: it is derived from the
 * amount. Approving a row that isn't `captured` (failed/refunded/pending) is
 * allowed but changes nothing publicly, because the wall only lists captured
 * rows. Response: `{ data: { sponsor: AdminSponsor } }`, 404 for an unknown id.
 */
adminSponsors.patch(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:sponsors:write"),
  async (c) => {
    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, { bucket: "admin-sponsors-update", limit: 30, windowSeconds: 60 });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    const rawBody = await c.req.json().catch(() => null);
    if (mentionsTier(rawBody)) return errorResponse(c, 400, "tier_not_editable", TIER_MESSAGE);

    const parsed = patchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(c, 400, "invalid_request", validationMessage(parsed.error));
    }
    const body = parsed.data;

    // Only fields that were actually sent; `undefined` means "leave as is".
    const patch: AdminSponsorPatch = {};
    if (body.displayName !== undefined) patch.display_name = body.displayName;
    if (body.githubUsername !== undefined) patch.github_username = body.githubUsername;
    if (body.showAmount !== undefined) patch.show_amount = body.showAmount;
    if (body.isAnonymous !== undefined) patch.is_anonymous = body.isAnonymous;
    if (body.approved !== undefined) patch.approved = body.approved;
    if (body.hidden !== undefined) patch.hidden = body.hidden;

    // Names and usernames are deliberately NOT copied into the audit row.
    const auditMetadata = {
      updatedFields: Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined),
      approved: body.approved ?? null,
      hidden: body.hidden ?? null,
      isAnonymous: body.isAnonymous ?? null,
      showAmount: body.showAmount ?? null,
    };

    try {
      const sponsor = await updateAdminSponsor(getSupabase(getEnv(c.env)), idResult.data, patch);
      if (!sponsor) return errorResponse(c, 404, "sponsor_not_found", "Sponsor not found");

      await audit(c, {
        action: "ADMIN_SPONSOR_UPDATED",
        resourceType: "sponsorship",
        resourceId: sponsor.id,
        result: "SUCCESS",
        metadata: auditMetadata,
      });
      return c.json({ data: { sponsor } }, 200);
    } catch (err) {
      logger.error("admin_sponsor_update_failed", { error: errorText(err), requestId: c.get("requestId") });
      await audit(c, {
        action: "ADMIN_SPONSOR_UPDATED",
        resourceType: "sponsorship",
        resourceId: idResult.data,
        result: "FAILURE",
        metadata: { error: errorText(err) },
      });
      return errorResponse(c, 500, "internal_error", "Couldn't update this sponsor right now");
    }
  },
);

/* ---------------------------------------------------------------------------
 * DELETE /admin/sponsors/:id  (soft hide)
 * ------------------------------------------------------------------------- */

/**
 * Takes a sponsor off the public wall by setting `hidden = true`. The row,
 * and its contribution to the monthly total, are kept. Idempotent. To bring
 * the sponsor back, `PATCH { "hidden": false }`.
 * Response: `{ data: { sponsor: AdminSponsor } }`, 404 for an unknown id.
 */
adminSponsors.delete(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:sponsors:write"),
  async (c) => {
    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);

    const withinLimit = await checkRateLimit(c, { bucket: "admin-sponsors-hide", limit: 30, windowSeconds: 60 });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    try {
      const sponsor = await hideAdminSponsor(getSupabase(getEnv(c.env)), idResult.data);
      if (!sponsor) return errorResponse(c, 404, "sponsor_not_found", "Sponsor not found");

      await audit(c, {
        action: "ADMIN_SPONSOR_HIDDEN",
        resourceType: "sponsorship",
        resourceId: sponsor.id,
        result: "SUCCESS",
        metadata: { hidden: true },
      });
      return c.json({ data: { sponsor } }, 200);
    } catch (err) {
      logger.error("admin_sponsor_hide_failed", { error: errorText(err), requestId: c.get("requestId") });
      await audit(c, {
        action: "ADMIN_SPONSOR_HIDDEN",
        resourceType: "sponsorship",
        resourceId: idResult.data,
        result: "FAILURE",
        metadata: { error: errorText(err) },
      });
      return errorResponse(c, 500, "internal_error", "Couldn't hide this sponsor right now");
    }
  },
);

/* ---------------------------------------------------------------------------
 * PUT /admin/sponsor-goal
 * ------------------------------------------------------------------------- */

/**
 * Sets the goal for a month (default: the current month in India time),
 * creating or replacing that month's row in `devtunnel.sponsor_goals`.
 * Body `goalInr` is rupees (stored as paise). `note` is optional: omit it to
 * keep the existing note, send `null` or "" to clear it.
 * Response: `{ data: { goal: { month, goalPaise, goalInr, note } } }`
 * with `month` as "YYYY-MM-01".
 */
adminSponsorGoal.put(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:sponsors:write"),
  async (c) => {
    const withinLimit = await checkRateLimit(c, { bucket: "admin-sponsor-goal", limit: 30, windowSeconds: 60 });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    const rawBody = await c.req.json().catch(() => null);
    const parsed = goalSchema.safeParse(rawBody);
    if (!parsed.success) {
      return errorResponse(c, 400, "invalid_request", validationMessage(parsed.error));
    }

    const month = `${parsed.data.month ?? istMonthKey()}-01`;
    const goalPaise = Math.round(parsed.data.goalInr * 100);

    try {
      const goal = await upsertSponsorGoal(getSupabase(getEnv(c.env)), {
        month,
        goalPaise,
        note: parsed.data.note,
      });

      await audit(c, {
        action: "ADMIN_SPONSOR_GOAL_SET",
        resourceType: "sponsor_goal",
        resourceId: goal.month,
        result: "SUCCESS",
        metadata: { month: goal.month, goalPaise: goal.goalPaise, noteChanged: parsed.data.note !== undefined },
      });
      return c.json({ data: { goal } }, 200);
    } catch (err) {
      logger.error("admin_sponsor_goal_failed", { error: errorText(err), requestId: c.get("requestId") });
      await audit(c, {
        action: "ADMIN_SPONSOR_GOAL_SET",
        resourceType: "sponsor_goal",
        resourceId: month,
        result: "FAILURE",
        metadata: { error: errorText(err) },
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the goal right now");
    }
  },
);
