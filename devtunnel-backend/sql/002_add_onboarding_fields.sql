-- DevTunnel — Onboarding fields (extends Module C1 auth schema)
-- Adds the columns lib/onboarding/types.ts (OnboardingData) and
-- lib/onboarding/api.ts (PATCH /auth/onboarding) already assume exist.
-- Run once, after 001_create_schema.sql.

do $$
begin
  -- Matches the Role & Prerequisite Module's full "Choose Your Role" list
  -- (devtunnel_workflow.txt, Module 7): Frontend / Backend / Full Stack /
  -- Documentation / Testing / DevOps.
  if not exists (select 1 from pg_type where typname = 'developer_role' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.developer_role as enum (
      'FRONTEND', 'BACKEND', 'FULL_STACK', 'DOCUMENTATION', 'TESTING', 'DEVOPS'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'experience_level' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.experience_level as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
  end if;
  if not exists (select 1 from pg_type where typname = 'contributor_intent' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.contributor_intent as enum ('START_PROJECT', 'FIND_PROJECT');
  end if;
end $$;

-- If this migration already ran against an older version of this file
-- (developer_role with only FRONTEND/BACKEND/FULL_STACK), add the roles
-- that were introduced later. ALTER TYPE ... ADD VALUE cannot run inside
-- the DO block above (it can't run in the same transaction as other
-- schema changes on that type), so these are separate, idempotent
-- statements.
alter type devtunnel.developer_role add value if not exists 'DOCUMENTATION';
alter type devtunnel.developer_role add value if not exists 'TESTING';
alter type devtunnel.developer_role add value if not exists 'DEVOPS';

alter table devtunnel.users
  add column if not exists skills               text[] not null default '{}',
  add column if not exists technologies         text[] not null default '{}',
  add column if not exists developer_role       devtunnel.developer_role,
  add column if not exists experience_level     devtunnel.experience_level,
  add column if not exists interests            text[] not null default '{}',
  add column if not exists intent               devtunnel.contributor_intent,
  add column if not exists onboarding_completed boolean not null default false;