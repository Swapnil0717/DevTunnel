-- DevTunnel — Onboarding fields (extends Module C1 auth schema)
-- Adds the columns lib/onboarding/types.ts (OnboardingData) and
-- lib/onboarding/api.ts (PATCH /auth/onboarding) already assume exist.
-- Run once, after 001_create_schema.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'developer_role' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.developer_role as enum ('FRONTEND', 'BACKEND', 'FULL_STACK');
  end if;
  if not exists (select 1 from pg_type where typname = 'experience_level' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.experience_level as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
  end if;
  if not exists (select 1 from pg_type where typname = 'contributor_intent' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.contributor_intent as enum ('START_PROJECT', 'FIND_PROJECT');
  end if;
end $$;

alter table devtunnel.users
  add column if not exists skills               text[] not null default '{}',
  add column if not exists technologies         text[] not null default '{}',
  add column if not exists developer_role       devtunnel.developer_role,
  add column if not exists experience_level     devtunnel.experience_level,
  add column if not exists interests            text[] not null default '{}',
  add column if not exists intent               devtunnel.contributor_intent,
  add column if not exists onboarding_completed boolean not null default false;