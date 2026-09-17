-- DevTunnel — CLI authentication (devtunnel-cli `dev login` / `dev logout`).
--
-- A CLI process can't hold an httpOnly session cookie the way the browser
-- does (src/db/sessions.ts), so it needs its own opaque bearer token
-- instead. This table is that token's server-side record — deliberately
-- modeled on devtunnel.sessions (sql/001) rather than inventing a new
-- shape: same "store only a hash, never the raw token" posture (a
-- database read alone can never yield a usable token), same
-- delete-on-revoke semantics for `dev logout`.
--
-- Run once, after 028_add_user_submissions.sql.

create table if not exists devtunnel.cli_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references devtunnel.users (id) on delete cascade,
  token_hash    text not null unique,

  -- Free-text label the CLI sends at login time (hostname by default, see
  -- devtunnel-cli/src/commands/login.ts) so a user who runs `dev login` on
  -- several machines can eventually tell them apart. Never shown to
  -- anyone but the token's own owner.
  label         text,

  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz not null default now()
);

create index if not exists cli_tokens_user_id_idx on devtunnel.cli_tokens (user_id);
create index if not exists cli_tokens_expires_at_idx on devtunnel.cli_tokens (expires_at);

-- Same posture as every other table in this schema (sql/001): this
-- backend talks to Supabase exclusively with the service role key, which
-- bypasses RLS by design. RLS is enabled anyway as defense in depth, with
-- no policies, so anon/authenticated clients get zero access even if the
-- schema is ever accidentally exposed.
alter table devtunnel.cli_tokens enable row level security;
revoke all on devtunnel.cli_tokens from anon, authenticated;