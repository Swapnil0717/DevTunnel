// devtunnel-backend/src/lib/ai/listCache.ts
import { logger } from "../logger";

/**
 * Short-lived cache for a list AI search ranks over (Part 3: the active
 * DevTunnel projects and tools), stored in the Cloudflare Cache API.
 *
 * Why the Cache API and not KV: KV on the Workers Free plan allows only
 * 1,000 writes a day and this app is already close to its baseline
 * (Part 1 rule 1). The Cache API is free, has no daily write cap, and a
 * cached list is cheap to rebuild — so losing it is harmless.
 *
 * What may be cached: ONLY viewer-independent data. Anything per-viewer
 * (e.g. a contributor's project `matchPercent`) is layered on after the
 * list is read, never stored here.
 *
 * Behaviour and limits:
 *  - Cache API entries are per data centre and can't be purged from code,
 *    so a change to the underlying rows (an admin publishes or removes a
 *    project) shows up in AI search after at most `ttlSeconds` — plus the
 *    plain list endpoints, which are not cached, show it immediately.
 *  - On a `*.workers.dev` URL `put` silently does nothing (works only on a
 *    custom-domain route such as api.devtunnel.tech). The cost is one
 *    Supabase read per search instead of one per `ttlSeconds`; searches are
 *    rate limited per user, so that is bounded and never breaks the feature.
 *  - Every cached body is re-validated with `parse` on the way out; an
 *    entry that doesn't parse (older shape after a deploy, corruption) is
 *    treated as a miss and rebuilt.
 *  - A cache failure is never a request failure: read/write errors are
 *    logged and the list is loaded from the source.
 */

export interface CachedListOptions<T> {
  /** Stable name, e.g. `devtunnel-projects`. */
  name: string;
  /** Bump when the stored row shape changes so old entries are ignored. */
  version: string;
  ttlSeconds: number;
  /** Loads the authoritative list (Supabase). Called on a miss. */
  load: () => Promise<T[]>;
  /** Returns the typed list, or null when the stored body isn't a valid list. */
  parse: (raw: unknown) => T[] | null;
  /** Off-request-path work (the cache write): `c.executionCtx.waitUntil`. */
  waitUntil: (promise: Promise<unknown>) => void;
}

function getCacheStorage(): Cache | null {
  try {
    const storage = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

function cacheKey(name: string, version: string): Request {
  // Synthetic, internal-only URL: the Cache API just needs a well-formed GET key.
  return new Request(`https://ai-cache.devtunnel.internal/list/${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
}

export async function getCachedList<T>(options: CachedListOptions<T>): Promise<T[]> {
  const cache = getCacheStorage();
  const key = cacheKey(options.name, options.version);

  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const parsed = options.parse(await hit.json());
        if (parsed) return parsed;
      }
    } catch (err) {
      logger.warn("ai_list_cache_read_failed", {
        list: options.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const fresh = await options.load();

  if (cache) {
    options.waitUntil(
      cache
        .put(
          key,
          new Response(JSON.stringify(fresh), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `public, max-age=${options.ttlSeconds}`,
            },
          }),
        )
        .catch((err: unknown) => {
          // Best-effort: a failed cache write must never fail a search that already has its rows.
          logger.warn("ai_list_cache_write_failed", {
            list: options.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
    );
  }

  return fresh;
}
