import type { Env } from "../types";
import { logger } from "./logger";

/**
 * Hard guarantee that this Worker can never spend Workers KV's Free-plan
 * write/delete/list budget (1,000 each per day, account-wide).
 *
 * The app already moved every KV write elsewhere (Supabase, the Cache API,
 * Rate Limiting bindings — see wrangler.toml). This wrapper makes that a
 * rule the runtime enforces rather than a convention: the `RATE_LIMIT_KV`
 * binding handed to every request and cron run is read-only. `put`,
 * `delete` and `list` throw (and log `kv_write_blocked`) instead of
 * reaching Cloudflare, so a future code change, a rollback flag
 * (`USE_SUPABASE_CLI_CODES="false"`) or a stray call can't quietly burn the
 * account's daily budget. `get` still works for the read-only legacy
 * fallbacks (old cache seeding, Groq budget split).
 *
 * To deliberately allow KV writes again (e.g. on a paid plan), set the
 * `KV_WRITES_ALLOWED = "true"` var.
 */
function readOnlyKv(kv: KVNamespace): KVNamespace {
  const blocked = (operation: string) => () => {
    logger.error("kv_write_blocked", {
      operation,
      hint: "Workers KV writes are disabled to protect the Free-plan daily limit",
    });
    throw new Error(`Workers KV ${operation} is disabled (read-only guard)`);
  };

  return new Proxy(kv, {
    get(target, prop, receiver) {
      if (prop === "put" || prop === "delete" || prop === "list") {
        return blocked(String(prop));
      }
      const value = Reflect.get(target, prop, receiver);
      // KV methods must run with the real binding as `this`.
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Returns `env` with a read-only `RATE_LIMIT_KV` (unchanged when absent or explicitly allowed). */
export function guardKvWrites(env: Env): Env {
  if (!env.RATE_LIMIT_KV || env.KV_WRITES_ALLOWED === "true") return env;
  return { ...env, RATE_LIMIT_KV: readOnlyKv(env.RATE_LIMIT_KV) };
}
