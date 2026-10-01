-- DevTunnel — replace every Workers KV *write* with Supabase (KV migration).
--
-- WHY: the Workers Free plan allows 1,000 KV writes/day account-wide. The
-- backend was spending them on (a) the CLI login one-time codes, (b) the
-- catalog / issues / GitHub-detail caches and their cron warmers, (c) the scan
-- lock and (d) rate-limit counters. Once the daily budget is gone every KV
-- put fails, which broke `dev login` and produced most of the 5xx noise.
--
-- WHAT THIS ADDS (all in the `devtunnel` schema, service-role only, RLS on):
--
--   cli_auth_codes   one-time codes for the `dev login` loopback flow.
--                    Only sha256(code) is stored. Single use is enforced
--                    ATOMICALLY by consume_cli_auth_code() — KV could not do
--                    that (get-then-delete on an eventually consistent store).
--
--   cache_entries    durable copy of every cached JSON value (the SWR catalog
--                    caches, the plain TTL caches). The Worker layers an
--                    in-isolate map and the Cloudflare Cache API on top of
--                    this table; this is the copy that survives cold starts
--                    and cache eviction. content_hash lets the Worker skip
--                    rewriting an unchanged value (it only "touches" the
--                    timestamps).
--
--   scan_locks       lease-style lock for the GitHub scans. Taken with one
--                    atomic conditional upsert, and self-expiring if a Worker
--                    dies mid-scan.
--
--   purge_expired_kv_replacements()   housekeeping, called by the daily cron.
--
-- Run once, after 042_ai_provider_status.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. CLI one-time login codes
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.cli_auth_codes (
  code_hash   text        primary key,
  user_id     uuid        not null references devtunnel.users (id) on delete cascade,
  -- sha256(verifier) hex; checked by POST /auth/cli/token (PKCE-style).
  challenge   text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists cli_auth_codes_expires_at_idx on devtunnel.cli_auth_codes (expires_at);
create index if not exists cli_auth_codes_user_id_idx on devtunnel.cli_auth_codes (user_id);

alter table devtunnel.cli_auth_codes enable row level security;
revoke all on devtunnel.cli_auth_codes from anon, authenticated;

-- Atomically marks a code as used and returns what it resolves to. One UPDATE
-- statement, so two concurrent redemptions can never both succeed: the second
-- sees used_at already set and matches zero rows.
create or replace function devtunnel.consume_cli_auth_code(p_code_hash text)
returns table (out_user_id uuid, out_challenge text)
language sql
as $$
  update devtunnel.cli_auth_codes c
     set used_at = now()
   where c.code_hash = p_code_hash
     and c.used_at is null
     and c.expires_at > now()
  returning c.user_id, c.challenge;
$$;

revoke execute on function devtunnel.consume_cli_auth_code(text) from public, anon, authenticated;
grant execute on function devtunnel.consume_cli_auth_code(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Durable cache
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.cache_entries (
  -- e.g. 'swr:github-projects:catalog' or 'plain:admin-new-issues:scan'
  key           text        primary key,
  value         jsonb       not null,
  -- sha256 hex of the JSON text the Worker serialised. Compared before writing.
  content_hash  text        not null,
  -- When the value was last successfully refreshed (drives soft-TTL freshness).
  stored_at     timestamptz not null,
  -- Hard TTL: after this the row is ignored by readers and purged.
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

create index if not exists cache_entries_expires_at_idx on devtunnel.cache_entries (expires_at);

alter table devtunnel.cache_entries enable row level security;
revoke all on devtunnel.cache_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scan lock (lease)
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.scan_locks (
  name          text        primary key,
  owner         text        not null,
  locked_until  timestamptz not null
);

alter table devtunnel.scan_locks enable row level security;
revoke all on devtunnel.scan_locks from anon, authenticated;

-- Returns true if THIS caller now holds the lease. The conditional
-- ON CONFLICT ... WHERE makes acquisition atomic: an unexpired lease held by
-- someone else matches zero rows, so exactly one caller wins.
create or replace function devtunnel.try_acquire_scan_lock(
  p_name        text,
  p_owner       text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
as $$
declare
  v_rows integer;
begin
  insert into devtunnel.scan_locks as l (name, owner, locked_until)
  values (p_name, p_owner, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (name) do update
    set owner        = excluded.owner,
        locked_until = excluded.locked_until
    where l.locked_until <= now();

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Only the current owner can release; a stale worker can't free someone
-- else's lease.
create or replace function devtunnel.release_scan_lock(p_name text, p_owner text)
returns void
language sql
as $$
  delete from devtunnel.scan_locks where name = p_name and owner = p_owner;
$$;

revoke execute on function devtunnel.try_acquire_scan_lock(text, text, integer) from public, anon, authenticated;
revoke execute on function devtunnel.release_scan_lock(text, text) from public, anon, authenticated;
grant execute on function devtunnel.try_acquire_scan_lock(text, text, integer) to service_role;
grant execute on function devtunnel.release_scan_lock(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Housekeeping (called by the 03:00 UTC cron in src/index.ts)
-- ---------------------------------------------------------------------------
create or replace function devtunnel.purge_expired_kv_replacements()
returns jsonb
language plpgsql
as $$
declare
  v_cache integer;
  v_codes integer;
  v_locks integer;
begin
  delete from devtunnel.cache_entries where expires_at < now();
  get diagnostics v_cache = row_count;

  -- Keep used/expired codes for an hour so a replayed code is still
  -- distinguishable from an unknown one in logs, then drop them.
  delete from devtunnel.cli_auth_codes
   where expires_at < now() - interval '1 hour'
      or (used_at is not null and used_at < now() - interval '1 hour');
  get diagnostics v_codes = row_count;

  delete from devtunnel.scan_locks where locked_until < now() - interval '1 hour';
  get diagnostics v_locks = row_count;

  return jsonb_build_object('cache_entries', v_cache, 'cli_auth_codes', v_codes, 'scan_locks', v_locks);
end;
$$;

revoke execute on function devtunnel.purge_expired_kv_replacements() from public, anon, authenticated;
grant execute on function devtunnel.purge_expired_kv_replacements() to service_role;