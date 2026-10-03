import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { loadSponsorsResponse } from "../db/sponsorsPublic";

/**
 * Sponsors — public read API.
 *
 *  - `GET /sponsors` -> `{ data: SponsorsResponse }` (type: src/db/sponsorsPublic.ts)
 *
 * Public: no cookies, no session. Privacy (anonymous sponsors, hidden
 * amounts, no payment ids) is enforced in src/db/sponsorsPublic.ts.
 *
 * Caching, with NO Workers KV writes and no Supabase writes:
 *  1. Cloudflare's Cache API (`caches.default`) holds the JSON body for 5
 *     minutes per data centre, so most requests cost zero Supabase calls. It
 *     is best-effort: if it is unavailable the route just queries Supabase.
 *  2. The response carries `Cache-Control: public, s-maxage=300,
 *     stale-while-revalidate=600` for any CDN or Next.js `fetch` in front.
 * A new or approved sponsor therefore shows up within about 5 minutes.
 * Errors are never cached.
 */
export const sponsors = new Hono<{ Bindings: Env; Variables: Variables }>();

const CACHE_SECONDS = 300;
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";
// Bump the version to drop every cached copy after a response-shape change.
const CACHE_KEY = new Request("https://sponsors-cache.devtunnel.internal/v1/sponsors");

function getCacheStorage(): Cache | null {
  try {
    const storage = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

sponsors.get("/sponsors", async (c) => {
  const requestId = c.get("requestId") as string | undefined;

  // Local, free check; counted per client IP. A cached hit is cheap, this is abuse protection only.
  const withinLimit = await checkRateLimit(c, { bucket: "sponsors", limit: 60, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const headers = { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL };
  const cache = getCacheStorage();

  if (cache) {
    try {
      const hit = await cache.match(CACHE_KEY);
      if (hit) return c.body(await hit.text(), 200, headers);
    } catch (err) {
      logger.warn("sponsors_cache_read_failed", { requestId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  let body: string;
  try {
    body = JSON.stringify({ data: await loadSponsorsResponse(getSupabase(getEnv(c.env))) });
  } catch (err) {
    logger.error("sponsors_load_failed", { requestId, error: err instanceof Error ? err.message : String(err) });
    return errorResponse(c, 503, "sponsors_unavailable", "Sponsors are unavailable right now. Please try again shortly.");
  }

  if (cache) {
    c.executionCtx.waitUntil(
      cache
        .put(CACHE_KEY, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }))
        .catch((err: unknown) => {
          logger.warn("sponsors_cache_write_failed", { requestId, error: err instanceof Error ? err.message : String(err) });
        }),
    );
  }

  return c.body(body, 200, headers);
});
