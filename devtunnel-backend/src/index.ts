import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { requestId } from "./middleware/requestId";
import { corsMiddleware } from "./middleware/cors";
import { handleError } from "./middleware/errorHandler";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { contributions } from "./routes/contributions";
import { devtunnelStats } from "./routes/devtunnelStats";
import { admin } from "./routes/admin/index";
import { runDailyDiscovery } from "./lib/aiDiscoveryAgent";
import { getEnv } from "./config/env";
import { logger } from "./lib/logger";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestId);
app.use("*", corsMiddleware());

app.route("/", health);
app.route("/auth", auth);
app.route("/", contributions);
app.route("/", devtunnelStats);
app.route("/admin", admin);

app.onError(handleError);

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger (wrangler.toml [triggers]) — runs the AI
   * Discovery agent once a day. `ctx.waitUntil` lets it keep running
   * past the point Cloudflare would otherwise consider the invocation
   * finished; a crash here is caught and logged, never left unhandled
   * (it can't surface to any user anyway — this is a background job).
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runDailyDiscovery(getEnv(env)).catch((err) => {
        logger.error("ai_discovery_scheduled_run_failed", { error: err instanceof Error ? err.message : String(err) });
      }),
    );
  },
};