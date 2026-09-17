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
import { admin } from "./routes/admin/index";
import { runDailyDiscovery } from "./lib/aiDiscoveryAgent";
import { warmGithubCatalogs, warmContributorIssuesScan } from "./lib/cacheWarmers";
import { getEnv } from "./config/env";
import { logger } from "./lib/logger";

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
app.route("/admin", admin);

app.onError(handleError);

/**
 * Cloudflare Cron Triggers (wrangler.toml `[triggers].crons`) — this Worker
 * has three schedules, and `event.cron` (the exact cron expression that
 * fired) is how one `scheduled` handler tells them apart:
 *
 *  - `"0 3 * * *"` — once daily at 03:00 UTC: the AI Discovery agent
 *    (unchanged from before this change).
 *  - `"*//**4 * * * *"` — every 4 minutes: re-scans and re-caches the
 *    contributor-facing `/issues` GitHub scan (`ISSUES_SCAN_CACHE_KEY`,
 *    src/routes/issues.ts), comfortably under that cache's 4-minute soft
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
 * whatever's still in KV in the meantime.
 */
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const validatedEnv = getEnv(env);

  switch (event.cron) {
    case "*/4 * * * *":
      ctx.waitUntil(
        warmContributorIssuesScan(validatedEnv, env).catch((err) => {
          logger.error("issues_warm_scheduled_run_failed", {
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
      ctx.waitUntil(
        runDailyDiscovery(validatedEnv, env.RATE_LIMIT_KV).catch((err) => {
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