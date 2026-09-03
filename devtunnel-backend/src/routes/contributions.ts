import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables, ContributionCalendar } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { getCached, setCached } from "../lib/cache";
import { getValidGithubAccessToken, clearGithubTokens } from "../db/githubTokens";
import { fetchContributionCalendar, fetchContributionSummary, GitHubGraphQLError } from "../lib/githubGraphql";

export const contributions = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GitHub launched April 2008 — there is no contribution data before that,
 * so this is a safe, documented floor for month navigation rather than an
 * arbitrary invented limit. Kept as a plain constant (not derived from
 * anything user-specific) since we don't store each user's GitHub account
 * creation date.
 */
const EARLIEST_MONTH = "2008-01";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthQuerySchema = z.string().regex(MONTH_PATTERN, "month must be formatted as YYYY-MM");

function currentMonthUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive [from, to] ISO bounds in UTC for a given YYYY-MM month. */
function monthBoundsISO(month: string): { fromISO: string; toISO: string } {
  const [yearStr, monthStr] = month.split("-") as [string, string];
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

/**
 * Defensively drops any day GitHub's response includes outside the
 * requested month — a second, cheap guarantee on top of what's been
 * observed of GitHub's own range-clipping behavior, so a client never
 * renders a stray day from an adjacent month even if that ever changes
 * upstream.
 */
function clipToMonth(calendar: ContributionCalendar, month: string): ContributionCalendar {
  const weeks = calendar.weeks
    .map((week) => ({
      days: week.days.filter((day) => day.date.startsWith(month)),
    }))
    .filter((week) => week.days.length > 0);
  return { totalContributions: calendar.totalContributions, weeks };
}

/**
 * Resolves a usable GitHub access token for the requesting user, or
 * responds with a 403 `github_reauth_required` when none exists (never
 * connected, or their stored token/refresh token is dead). Centralized
 * here since both routes below need identical handling.
 */
async function resolveAccessTokenOrRespond(
  c: Parameters<Parameters<typeof contributions.get>[1]>[0],
  userId: string,
): Promise<string | Response> {
  const env = getEnv(c.env);
  const supabase = getSupabase(env);
  const token = await getValidGithubAccessToken(supabase, env, userId);
  if (!token) {
    return errorResponse(
      c,
      403,
      "github_reauth_required",
      "Reconnect your GitHub account to view contribution history",
    );
  }
  return token;
}

/**
 * `GET /users/me/contributions?month=YYYY-MM`
 *
 * Returns the authenticated user's real GitHub contribution calendar for
 * one calendar month — the "green squares" grid, one month at a time,
 * matching devtunnel-frontend's profile page contribution-history tab.
 * `month` defaults to the current UTC month when omitted.
 *
 * The GitHub username and access token are both derived exclusively from
 * the authenticated session's own user row, never from any client-
 * supplied value — this endpoint can only ever return the caller's own
 * calendar (rule 12/75: never trust client-supplied identity for what
 * resource to load), fetched using the caller's own GitHub authorization
 * (see src/db/githubTokens.ts for why — accurate private-contribution
 * visibility, no shared-token rate-limit contention across users).
 *
 * Response:
 *   { data: { month, githubUsername, totalContributions, weeks,
 *              canGoPrevious, canGoNext } }
 */
contributions.get("/users/me/contributions", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: "contributions-month",
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
  if (month < EARLIEST_MONTH) {
    return errorResponse(c, 400, "month_out_of_range", `Cannot request a month before ${EARLIEST_MONTH}`);
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  if (!user.githubUsername) {
    return errorResponse(c, 404, "github_account_not_linked", "No linked GitHub account");
  }

  const tokenOrResponse = await resolveAccessTokenOrRespond(c, user.id);
  if (typeof tokenOrResponse !== "string") return tokenOrResponse;
  const accessToken = tokenOrResponse;

  const login = user.githubUsername;
  const cacheKey = `contrib:month:${login.toLowerCase()}:${month}`;
  // The current month's data changes throughout the day; a completed past
  // month essentially never changes, so it can be cached much longer
  // (rule 65: cache public, relatively stable data; rule 42: protect an
  // expensive external-API-backed endpoint).
  const ttlSeconds = month === current ? 15 * 60 : 24 * 60 * 60;

  try {
    let calendar = await getCached<ContributionCalendar>(c.env, cacheKey);
    if (!calendar) {
      const { fromISO, toISO } = monthBoundsISO(month);
      calendar = clipToMonth(await fetchContributionCalendar(accessToken, login, fromISO, toISO), month);
      await setCached(c.env, cacheKey, calendar, ttlSeconds);
    }

    return c.json(
      {
        data: {
          month,
          githubUsername: login,
          totalContributions: calendar.totalContributions,
          weeks: calendar.weeks,
          canGoPrevious: month > EARLIEST_MONTH,
          canGoNext: month < current,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubGraphQLError) {
      if (err.reason === "user_not_found") {
        return errorResponse(c, 404, "github_user_not_found", "GitHub profile not found");
      }
      if (err.reason === "invalid_token") {
        const supabase = getSupabase(env);
        await clearGithubTokens(supabase, user.id).catch((clearErr) =>
          logger.error("github_token_clear_failed", { userId: user.id, error: String(clearErr) }),
        );
        return errorResponse(
          c,
          403,
          "github_reauth_required",
          "Reconnect your GitHub account to view contribution history",
        );
      }
    }
    logger.error("contributions_month_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 502, "github_unavailable", "Couldn't load contribution data right now");
  }
});

/**
 * `GET /users/me/contributions/summary`
 *
 * Rolling 365-day total contributions, backing the profile page's
 * "Contributions" stat card. Deliberately does not attempt to source
 * "Projects" or "Pull requests" counts here — those are DevTunnel-native
 * concepts with no backing table yet (only `users`/`sessions` exist —
 * see sql/001_create_schema.sql), and fabricating a number for them would
 * violate rule 37/38 (never fake metrics).
 *
 * Response: { data: { totalContributions, fromDate, toDate } }
 */
contributions.get("/users/me/contributions/summary", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: "contributions-summary",
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
  if (!user.githubUsername) {
    return errorResponse(c, 404, "github_account_not_linked", "No linked GitHub account");
  }

  const tokenOrResponse = await resolveAccessTokenOrRespond(c, user.id);
  if (typeof tokenOrResponse !== "string") return tokenOrResponse;
  const accessToken = tokenOrResponse;

  const login = user.githubUsername;
  const cacheKey = `contrib:summary:${login.toLowerCase()}`;

  try {
    type SummaryPayload = { totalContributions: number; fromISO: string; toISO: string };
    let summary = await getCached<SummaryPayload>(c.env, cacheKey);
    if (!summary) {
      summary = await fetchContributionSummary(accessToken, login);
      await setCached(c.env, cacheKey, summary, 60 * 60); // 1 hour
    }

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
    if (err instanceof GitHubGraphQLError) {
      if (err.reason === "user_not_found") {
        return errorResponse(c, 404, "github_user_not_found", "GitHub profile not found");
      }
      if (err.reason === "invalid_token") {
        const supabase = getSupabase(env);
        await clearGithubTokens(supabase, user.id).catch((clearErr) =>
          logger.error("github_token_clear_failed", { userId: user.id, error: String(clearErr) }),
        );
        return errorResponse(
          c,
          403,
          "github_reauth_required",
          "Reconnect your GitHub account to view contribution history",
        );
      }
    }
    logger.error("contributions_summary_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 502, "github_unavailable", "Couldn't load contribution data right now");
  }
});