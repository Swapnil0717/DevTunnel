-- DevTunnel — GitHub Open Source Tool onboarding nominations.
--
-- Backs the contributor-facing "Nominate for DevTunnel" action on the
-- GitHub Open Source Tools Detail page (devtunnel-frontend
-- `RequestToolOnboardingButton` → `POST /github-open-source-tools/:slug/request-
-- onboarding`, src/routes/githubOpenSourceTools.ts). Sibling of
-- devtunnel.github_project_nominations (sql/023) — same shape, same
-- reasoning — kept as its own table rather than a shared one so the
-- two catalogs' admin review queues (Projects vs. Open Source Tools)
-- stay independently queryable/filterable without a discriminator
-- column, matching how `/github-projects` and
-- `/github-open-source-tools` are already two separate catalogs
-- (lib/githubCatalog.ts) rather than one catalog with a type flag.
--
-- Run once, after 023_add_github_project_nominations.sql.

create schema if not exists devtunnel;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'github_tool_nomination_status' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.github_tool_nomination_status as enum ('PENDING', 'REVIEWED', 'DISMISSED');
  end if;
end $$;

create table if not exists devtunnel.github_open_source_tool_nominations (
  id                    uuid primary key default gen_random_uuid(),

  repository_full_name  text not null,
  repository_url        text not null,

  requested_by          uuid not null references devtunnel.users (id) on delete cascade,

  status                devtunnel.github_tool_nomination_status not null default 'PENDING',
  reviewed_by           uuid references devtunnel.users (id) on delete set null,
  reviewed_at           timestamptz,

  created_at            timestamptz not null default now()
);

-- One active (PENDING) nomination per repository at a time — same
-- de-duplication posture as github_project_nominations (sql/023); see
-- db/githubOpenSourceToolNominations.ts `recordGithubToolNomination`.
create unique index if not exists github_tool_nominations_repo_pending_key
  on devtunnel.github_open_source_tool_nominations (repository_full_name)
  where status = 'PENDING';

-- One admin queue view, newest first — mirrors
-- github_project_nominations_status_idx (sql/023).
create index if not exists github_tool_nominations_status_idx
  on devtunnel.github_open_source_tool_nominations (status, created_at desc);

-- Same defense-in-depth posture every table in this schema takes
-- (sql/001 README): this backend is the trusted server-side boundary
-- and authorizes in code via the service role key, never via RLS + a
-- user JWT, so anon/authenticated get no grants at all.
alter table devtunnel.github_open_source_tool_nominations enable row level security;
revoke all on devtunnel.github_open_source_tool_nominations from anon, authenticated;