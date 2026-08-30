import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedEnv } from "../config/env";

/**
 * One client per request, scoped to `SUPABASE_DB_SCHEMA` (see
 * sql/README.md — this is the `devtunnel` Postgres schema, kept separate
 * from whatever tables your wishlist app already has in `public`).
 *
 * Uses the **service role key** deliberately: this backend is the trusted
 * server-side boundary (rule 10) and does its own authorization checks in
 * code (session lookup, ownership checks) rather than relying on
 * Postgres RLS + a user JWT. The service role key must never reach the
 * frontend or any log line (rules 6, 8, 59) — it only ever lives in this
 * Worker's secret bindings.
 *
 * `auth: { persistSession: false }` because Workers isolates are
 * short-lived and stateless — there is nothing to persist a session into
 * (rule 68).
 */
export function getSupabase(env: ValidatedEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: env.SUPABASE_DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "devtunnel-backend" } },
  });
}
