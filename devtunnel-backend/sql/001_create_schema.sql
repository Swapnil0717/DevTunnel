-- DevTunnel — Auth module schema (Module C1)
-- Run this once in the Supabase SQL Editor (or via `psql`) on your existing
-- project. It creates a dedicated `devtunnel` Postgres schema so these
-- tables never collide with your wishlist app's tables in `public` — see
-- sql/README.md for the full integration steps (including exposing this
-- schema to the Supabase API).
--
-- Only the tables this backend actually uses are created here (User +
-- Session). The rest of devtunnel_schema.prisma (Project, Task,
-- Contribution, ...) is a separate migration for later modules and is
-- intentionally NOT included, per Backend_Development_Rules.txt rule 5
-- (never invent schema beyond what's actually being built/verified).

create schema if not exists devtunnel;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.user_role as enum ('CONTRIBUTOR', 'MAINTAINER', 'ADMIN');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- users — mirrors the frontend-facing subset of `model User` in
-- devtunnel_schema.prisma. Columns beyond auth (skills, projects, etc.)
-- belong to later modules and are added by future migrations, not here.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  username            text not null unique,
  name                text,
  bio                 text,
  avatar_url          text,

  github_id           text not null unique,
  github_username     text,
  github_profile_url  text,

  role                devtunnel.user_role not null default 'CONTRIBUTOR',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_login_at       timestamptz
);

create index if not exists users_github_id_idx on devtunnel.users (github_id);
create index if not exists users_role_idx on devtunnel.users (role);

create or replace function devtunnel.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_set_updated_at on devtunnel.users;
create trigger users_set_updated_at
  before update on devtunnel.users
  for each row execute function devtunnel.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — server-side session store backing the `dt_session` cookie.
-- Only a SHA-256 hash of the session token is ever stored (see
-- src/db/sessions.ts) so a database read alone can never yield a usable
-- session token.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references devtunnel.users (id) on delete cascade,
  token_hash    text not null unique,

  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_used_at  timestamptz not null default now(),
  user_agent    text
);

create index if not exists sessions_user_id_idx on devtunnel.sessions (user_id);
create index if not exists sessions_expires_at_idx on devtunnel.sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Access control: this backend talks to Supabase exclusively with the
-- service role key (see src/lib/supabase.ts), which bypasses RLS by
-- design. RLS is enabled anyway as defense in depth, with no policies —
-- meaning the anon/authenticated roles (used by any client-side Supabase
-- SDK, e.g. your wishlist frontend) get zero access to these tables even
-- if the schema is accidentally exposed.
-- ---------------------------------------------------------------------------
alter table devtunnel.users enable row level security;
alter table devtunnel.sessions enable row level security;

revoke all on devtunnel.users from anon, authenticated;
revoke all on devtunnel.sessions from anon, authenticated;
