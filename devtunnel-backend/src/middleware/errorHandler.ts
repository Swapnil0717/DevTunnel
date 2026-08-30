import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";

/**
 * Registered via `app.onError` in src/index.ts (rule 20: error handling
 * must be centralized). Route handlers should mostly let errors bubble up
 * here rather than each rolling their own try/catch response — the
 * exception is spots that need a specific safe reason code (see
 * routes/auth.ts), which catch locally and rethrow as `HTTPException` or
 * return a mapped response directly.
 *
 * Rule 19: full error detail (message, stack) is logged server-side only,
 * keyed by requestId — the client only ever gets a generic message plus
 * that id to quote back in a support request.
 */
export function handleError(err: unknown, c: Context) {
  const requestId = c.get("requestId") as string | undefined;

  if (err instanceof HTTPException) {
    logger.warn("http_exception", { requestId, status: err.status, message: err.message });
    return err.getResponse();
  }

  logger.error("unhandled_error", {
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return errorResponse(c, 500, "internal_error", "Something went wrong. Please try again.");
}
