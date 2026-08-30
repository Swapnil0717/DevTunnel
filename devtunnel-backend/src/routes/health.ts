import { Hono } from "hono";
import type { Env, Variables } from "../types";

/** rule 62–63: a health endpoint exists, but reveals no internal state. */
export const health = new Hono<{ Bindings: Env; Variables: Variables }>();

health.get("/health", (c) => c.json({ status: "ok" }, 200));
