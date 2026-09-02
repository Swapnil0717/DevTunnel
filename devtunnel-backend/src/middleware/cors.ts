import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";
import { getEnv, allowedOrigins } from "../config/env";

/**
 * Rules 45–46: explicit allowlist only, never `Access-Control-Allow-Origin:
 * *` for this cookie-authenticated API, and never blindly reflect the
 * request's `Origin` header. `credentials: true` is required so the
 * browser will actually send `dt_session` cross-subdomain
 * (api.devtunnel.tech -> devtunnel.tech).
 */
export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const env = getEnv(c.env);
    const allowed = new Set(allowedOrigins(env));

    const handler = cors({
      origin: (origin) => (origin && allowed.has(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    });

    return handler(c, next);
  };
}