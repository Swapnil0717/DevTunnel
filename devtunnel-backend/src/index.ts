import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { requestId } from "./middleware/requestId";
import { corsMiddleware } from "./middleware/cors";
import { handleError } from "./middleware/errorHandler";
import { auth } from "./routes/auth";
import { health } from "./routes/health";
import { contributions } from "./routes/contributions";
import { devtunnelStats } from "./routes/devtunnelStats";

import { logger } from "./lib/logger";
import { admin } from "./routes/admin/index";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestId);
app.use("*", corsMiddleware());

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  logger.info("request_completed", {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  });
});

app.route("/auth", auth);
app.route("/", health);
app.route("/", contributions);
app.route("/", devtunnelStats);
// Admin Backend (devtunnel_workflow.txt section 43). Every route in
// ./routes/admin enforces its own requireAuth + requireAdminRole (+
// requirePermission where relevant) — see src/routes/admin/index.ts.
app.route("/admin", admin);

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Not found", requestId: c.get("requestId") } }, 404),
);

app.onError(handleError);

export default app;