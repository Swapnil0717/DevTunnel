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


const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", requestId);
app.use("*", corsMiddleware());

app.route("/", health);
app.route("/auth", auth);
app.route("/", contributions);
app.route("/", devtunnelStats);
app.route("/admin", admin);

app.onError(handleError);

export default app;