import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { optionalAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { BUG_AREAS, BUG_SEVERITIES, createBugReport } from "../db/bugReports";

/**
 * "Found a bug" popup in the app header.
 *
 *  - `POST /bug-reports` — saves one report.
 *
 * Open to signed-out visitors as well as signed-in ones, because the header
 * (and so the popup) is shown to guests. `optionalAuth` only decides whether
 * the report is linked to an account; it never rejects. The abuse control is
 * the rate limit (per user when signed in, per IP otherwise) plus the length
 * limits below, which the database repeats as CHECK constraints (sql/050).
 *
 * The browser sends `pageUrl` (where the bug happened); the Worker adds the
 * `User-Agent` itself. No IP address, email or other personal data is stored.
 *
 * Supabase only — no Workers KV.
 */
export const bugReports = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Trims, and turns "" into `null` so optional fields store NULL rather than an empty string. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    });

const bodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Add a short title")
    .max(120, "Keep the title under 120 characters"),
  area: z.enum(BUG_AREAS, { errorMap: () => ({ message: "Pick where it happened" }) }),
  severity: z.enum(BUG_SEVERITIES, { errorMap: () => ({ message: "Pick how bad it is" }) }),
  description: z
    .string()
    .trim()
    .min(10, "Describe what happened in a few words")
    .max(2000, "Keep the description under 2000 characters"),
  steps: optionalText(2000, "Keep the steps under 2000 characters"),
  expected: optionalText(500, "Keep this under 500 characters"),
  pageUrl: optionalText(500, "Page address is too long"),
});

bugReports.post("/bug-reports", optionalAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");

  const withinLimit = await checkRateLimit(c, {
    bucket: "bug-reports",
    limit: 5,
    windowSeconds: 60,
    // Signed in: follow the person. Signed out: default to the connecting IP.
    ...(user ? { identity: `user:${user.id}` } : {}),
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return errorResponse(c, 400, "invalid_request", "Request body must be valid JSON");
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_request", parsed.error.issues[0]!.message);
  }

  try {
    const supabase = getSupabase(env);
    await createBugReport(supabase, user?.id ?? null, {
      ...parsed.data,
      userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
    });
    return c.json({ saved: true }, 201);
  } catch (err) {
    logger.error("bug_report_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't save your report right now");
  }
});
