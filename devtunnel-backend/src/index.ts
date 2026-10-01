import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { requestId } from "./middleware/requestId";
import { corsMiddleware } from "./middleware/cors";
import { handleError } from "./middleware/errorHandler";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { authCli } from "./routes/authCli";
import { contributions } from "./routes/contributions";
import { devtunnelStats } from "./routes/devtunnelStats";
import { issues } from "./routes/issues";
import { githubProjects } from "./routes/githubProjects";
import { githubOpenSourceTools } from "./routes/githubOpenSourceTools";
import { projects } from "./routes/projects";
import { openSourceTools } from "./routes/openSourceTools";
import { tasks } from "./routes/tasks";
import { contribute } from "./routes/contribute";
import { submissions } from "./routes/submissions";
import { settings } from "./routes/settings";
import { userActivity } from "./routes/userActivity";
import { profileActivity } from "./routes/profileActivity";
import { githubCatalogContribute } from "./routes/githubCatalogContribute";
import { aiSummary } from "./routes/aiSummary";
import { aiIssueExplanation } from "./routes/aiIssueExplanation";
import { aiIssueInsights } from "./routes/aiIssueInsights";
import { admin } from "./routes/admin/index";
import { runDailyDiscovery } from "./lib/aiDiscoveryAgent";
import { flushAiUsage } from "./lib/ai/usage";
import {
  warmGithubCatalogs,
  warmGithubStarBuckets,
  warmContributorIssuesScan,
} from "./lib/cacheWarmers";
import { purgeExpiredCacheRows } from "./lib/cache";
import { getEnv } from "./config/env";
import { logger } from "./lib/logger";
import { syncSubmittedPullRequests } from "./lib/prSync";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestId);
app.use("*", corsMiddleware());

app.route("/", health);
app.route("/auth", auth);
// devtunnel-cli's `dev login`/`dev logout` — see src/routes/authCli.ts for
// the loopback OAuth flow this backs. Mounted at a sub-path of `/auth`
// alongside (not inside) the web `auth` router above so the two stay
// fully independent routers with zero shared state, while still reading
// as "this is part of authentication" in the URL space.
app.route("/auth/cli", authCli);
app.route("/", contributions);
app.route("/", devtunnelStats);
app.route("/", issues);
app.route("/", githubProjects);
app.route("/", githubOpenSourceTools);
app.route("/", projects);
app.route("/", openSourceTools);
app.route("/", tasks);
app.route("/", contribute);
app.route("/", submissions);
app.route("/", settings);
app.route("/", userActivity);
// Profile page: `POST /tasks/:id/view` + `GET /users/me/profile-activity`
// (src/routes/profileActivity.ts), and the raw GitHub catalogs' "Contribute"
// button (`POST /github-projects/:slug/contribute` and its tools twin,
// src/routes/githubCatalogContribute.ts).
app.route("/", profileActivity);
app.route("/", githubCatalogContribute);
// AI summary card on the five detail pages: `POST /ai/summary`
// (src/routes/aiSummary.ts, Part 4). Signed-in only; stored-first, so a page
// that already has a summary costs one Supabase read and no model call.
app.route("/", aiSummary);
// AI issue explanation ("Explain" on each issue row): `POST /ai/issue-explanation`
// (src/routes/aiIssueExplanation.ts, Part 5). Signed-in only; stored-first, so
// a second click on an unchanged issue costs one Supabase read and no model call.
app.route("/", aiIssueExplanation);
// AI issue insights (the card at the top of a repository's Issues tab):
// `POST /ai/issue-insights` (src/routes/aiIssueInsights.ts, Part 6). Signed-in
// only; stored-first, so a repository with fresh insights costs one Supabase
// read and no GitHub or model call.
app.route("/", aiIssueInsights);
app.route("/admin", admin);

app.onError(handleError);

/**
 * Cloudflare Cron Triggers (wrangler.toml `[triggers].crons`) — this Worker
 * has four schedules (the fourth, `"12 * * * *"`, warms one
 * `/github-projects` star-range bucket per run — see
 * `warmRotatingCatalogFilter` in lib/githubCatalog.ts), and `event.cron` (the exact cron expression that
 * fired) is how one `scheduled` handler tells them apart:
 *
 *  - `"0 3 * * *"` — once daily at 03:00 UTC: the AI Discovery agent
 *    (unchanged from before this change).
 *  - `"*//**15 * * * *"` — every 15 minutes: re-scans and re-caches the
 *    contributor-facing `/issues` GitHub scan (`ISSUES_SCAN_CACHE_KEY`,
 *    src/routes/issues.ts), under that cache's 20-minute soft
 *    TTL so real contributor requests essentially always see a fresh
 *    entry rather than triggering a scan themselves.
 *  - `"*//**25 * * * *"` — every 25 minutes: re-scans and re-caches both
 *    GitHub-wide catalogs (`/github-projects`, `/github-open-source-tools`
 *    — base catalog plus every named filter), comfortably under their
 *    30-minute soft TTL for the same reason.
 *
 * All three branches run independently and are individually best-effort —
 * `warmGithubCatalogs`/`warmContributorIssuesScan` catch and log their own
 * errors rather than throwing (see lib/cacheWarmers.ts), so one warmer
 * failing never affects another, and a failed run just means the next
 * scheduled run tries again while `withCacheSWR` readers keep serving
 * whatever's still cached (isolate memory / Cache API / Supabase
 * `cache_entries` — no longer Workers KV) in the meantime.
 */
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const validatedEnv = getEnv(env);

  switch (event.cron) {
    case "*/15 * * * *":
      ctx.waitUntil(
        warmContributorIssuesScan(validatedEnv, env).catch((err) => {
          logger.error("issues_warm_scheduled_run_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
      // Same 15-minute schedule also checks GitHub for the state of every
      // submitted PR (lib/prSync.ts): merged -> task/project DONE, closed
      // without merging -> back to IN_PROGRESS. Separate waitUntil so a
      // failure in one job never affects the other.
      ctx.waitUntil(
        syncSubmittedPullRequests(validatedEnv).catch((err) => {
          logger.error("pr_sync_scheduled_run_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
      return;

    case "12 * * * *":
      ctx.waitUntil(
        warmGithubStarBuckets(validatedEnv, env).catch((err) => {
          logger.error("catalog_star_bucket_scheduled_run_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
      return;

    case "*/25 * * * *":
      ctx.waitUntil(
        warmGithubCatalogs(validatedEnv, env).catch((err) => {
          logger.error("catalog_warm_scheduled_run_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
      return;

    case "0 3 * * *":
    default:
      // Falls through to the daily AI Discovery run for its own schedule,
      // and defensively for any cron expression this handler doesn't
      // otherwise recognize (rather than silently doing nothing).
      // Daily housekeeping for the Supabase replacements of the old KV state
      // (expired cache rows, used/expired CLI login codes, stale scan locks —
      // sql/043). Separate waitUntil so it can't be blocked by, or block, discovery.
      ctx.waitUntil(purgeExpiredCacheRows(env));
      ctx.waitUntil(
        runDailyDiscovery(validatedEnv, env.RATE_LIMIT_KV)
          // Push the batched AI usage counters to Supabase before the isolate ends (src/lib/ai/usage.ts).
          .finally(() => flushAiUsage(validatedEnv))
          .catch((err) => {
          logger.error("ai_discovery_scheduled_run_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      );
      return;
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};