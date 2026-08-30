import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { requestId } from "./middleware/requestId";
import { corsMiddleware } from "./middleware/cors";
import { handleError } from "./middleware/errorHandler";
import { auth } from "./routes/auth";
import { health } from "./routes/health";
import { logger } from "./lib/logger";

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

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Not found", requestId: c.get("requestId") } }, 404),
);

app.onError(handleError);

export default app;
