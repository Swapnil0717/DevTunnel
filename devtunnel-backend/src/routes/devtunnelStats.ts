import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import {
  getDevTunnelStats,
  getDevTunnelMonthCalendar,
  getDevTunnelContributionSummary,
} from "../db/devtunnelStats";

export const devtunnelStats = new Hono<{ Bindings: Env; Variables: Variables }>();

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthQuerySchema = z.string().regex(MONTH_PATTERN, "month must be formatted as YYYY-MM");

function currentMonthUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Earliest month this user could possibly have DevTunnel-native activity
 * in — their own account creation month (`users.created_at`), never an
 * arbitrary invented floor. (Contrast with the fixed 2008-01 GitHub
 * launch-date floor in src/routes/contributions.ts — that's a real,
 * documented public fact about GitHub; DevTunnel has no equivalent
 * public constant to hang this on, so the honest per-user floor is the
 * account's own creation date.)
 */
function accountCreationMonth(createdAt: string): string {
  const d = new Date(createdAt);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `GET /users/me/devtunnel-stats`
 *
 * Projects created, projects maintained, tasks completed, and pull
 * requests merged — every number here is backed by a real table
 * (devtunnel-backend/sql/004_add_devtunnel_contributions.sql), never
 * derived from GitHub. `isMaintainer` is the same fact already folded
 * into `GET /auth/me`'s `user.isMaintainer` — included again here so a
 * caller that only hits this endpoint doesn't need a second request.
 *
 * Response: { data: { projectsCreated, projectsMaintaining,
 *   tasksCompleted, pullRequestsMerged, isMaintainer } }
 */
devtunnelStats.get("/users/me/devtunnel-stats", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: "devtunnel-stats",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const stats = await getDevTunnelStats(supabase, user.id);
    return c.json({ data: stats }, 200);
  } catch (err) {
    logger.error("devtunnel_stats_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load DevTunnel stats right now");
  }
});

/**
 * `GET /users/me/contributions/devtunnel?month=YYYY-MM`
 *
 * DevTunnel-native counterpart to `GET /users/me/contributions`
 * (src/routes/contributions.ts) — same response shape minus
 * `githubUsername` (this is the caller's own DevTunnel activity, not an
 * external account), same month-navigation semantics. Backed by
 * `devtunnel.activity_log`, which is populated exclusively by DB
 * triggers on tasks/pull_requests/projects (sql/004), never written to
 * directly by application code, so it can't drift from the tables it
 * summarizes.
 *
 * Unlike the GitHub endpoint, there is no "account not linked" state —
 * every signed-in DevTunnel user can query their own DevTunnel activity
 * by definition. A user with no DevTunnel activity yet simply gets an
 * honest all-zero month back, same as a brand-new GitHub account would.
 *
 * Response:
 *   { data: { month, totalContributions, weeks, canGoPrevious, canGoNext } }
 */
devtunnelStats.get("/users/me/contributions/devtunnel", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: "devtunnel-contributions-month",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const monthQuery = c.req.query("month") ?? currentMonthUTC();
  const parsedMonth = monthQuerySchema.safeParse(monthQuery);
  if (!parsedMonth.success) {
    return errorResponse(c, 400, "invalid_month", "month must be formatted as YYYY-MM");
  }
  const month = parsedMonth.data;
  const current = currentMonthUTC();

  if (month > current) {
    return errorResponse(c, 400, "month_out_of_range", "Cannot request a future month");
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const earliestMonth = accountCreationMonth(user.createdAt);
  if (month < earliestMonth) {
    return errorResponse(c, 400, "month_out_of_range", `Cannot request a month before ${earliestMonth}`);
  }

  try {
    const supabase = getSupabase(env);
    const calendar = await getDevTunnelMonthCalendar(supabase, user.id, month);

    return c.json(
      {
        data: {
          month,
          totalContributions: calendar.totalContributions,
          weeks: calendar.weeks,
          canGoPrevious: month > earliestMonth,
          canGoNext: month < current,
        },
      },
      200,
    );
  } catch (err) {
    logger.error("devtunnel_contributions_month_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load contribution data right now");
  }
});

/**
 * `GET /users/me/contributions/devtunnel/summary`
 *
 * Rolling 365-day DevTunnel-native contribution total — the number shown
 * next to the GitHub total on the profile page's "Contributions" stat
 * card (devtunnel-frontend components/profile/profile-stats.tsx).
 *
 * Response: { data: { totalContributions, fromDate, toDate } }
 */
devtunnelStats.get("/users/me/contributions/devtunnel/summary", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: "devtunnel-contributions-summary",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const summary = await getDevTunnelContributionSummary(supabase, user.id);

    return c.json(
      {
        data: {
          totalContributions: summary.totalContributions,
          fromDate: summary.fromISO,
          toDate: summary.toISO,
        },
      },
      200,
    );
  } catch (err) {
    logger.error("devtunnel_contributions_summary_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load contribution summary right now");
  }
});