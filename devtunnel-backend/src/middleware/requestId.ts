import type { MiddlewareHandler } from "hono";

/** rule 60: use request correlation / request IDs. */
export const requestId: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
