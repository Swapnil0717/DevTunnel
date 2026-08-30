import type { Context } from "hono";

/**
 * Consistent error envelope for every non-2xx JSON response
 * (Backend_Development_Rules.txt rule 18). `requestId` lets a user report
 * an error to support without any internal detail (stack traces, DB
 * errors, Supabase internals) ever reaching the client (rules 19, 63).
 */
export function errorResponse(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
) {
  const requestId = c.get("requestId") as string | undefined;
  return c.json(
    {
      error: {
        code,
        message,
        requestId,
      },
    },
    status,
  );
}
