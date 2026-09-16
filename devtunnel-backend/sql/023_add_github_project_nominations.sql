-- DevTunnel — GitHub Project onboarding nominations.
--
-- Backs the contributor-facing "Nominate for DevTunnel" action on the
-- GitHub Project Detail page (devtunnel-frontend
-- `RequestOnboardingButton` → `POST /github-projects/:slug/request-
-- onboarding`, src/routes/githubProjects.ts). A nomination never
-- onboards a repository by itself — it only queues the repository as a
-- candidate for an Admin to review and, if it's a good fit, run the
-- real multi-step Project Onboarding flow (sql/006) on. Deliberately a
-- much thinner table than devtunnel.ai_discovered_projects (sql/020):
-- there is no AI-authored reasoning, difficulty guess, or tech-stack
-- payload here, just "a real contributor flagged this repository" and
-- who flagged it.
--
-- Run once, after 022_fix_ai_discovery_approve_ambiguous_column.sql.

create schema if not exists devtunnel;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'github_project_nomination_status' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.github_project_nomination_status as enum ('PENDING', 'REVIEWED', 'DISMISSED');
  end if;
end $$;

create table if not exists devtunnel.github_project_nominations (
  id                    uuid primary key default gen_random_uuid(),

  repository_full_name  text not null,
  repository_url        text not null,

  requested_by          uuid not null references devtunnel.users (id) on delete cascade,

  status                devtunnel.github_project_nomination_status not null default 'PENDING',
  reviewed_by           uuid references devtunnel.users (id) on delete set null,
  reviewed_at           timestamptz,

  created_at            timestamptz not null default now()
);

-- One active (PENDING) nomination per repository at a time — a second
-- contributor nominating the same repository while it's already
-- awaiting review is treated as a no-op (see
-- db/githubProjectNominations.ts `recordGithubProjectNomination`),
-- rather than piling up duplicate rows an Admin would have to
-- de-duplicate by hand. Once reviewed (REVIEWED/DISMISSED), the same
-- repository can be nominated again later.
create unique index if not exists github_project_nominations_repo_pending_key
  on devtunnel.github_project_nominations (repository_full_name)
  where status = 'PENDING';

-- One admin queue view, newest first — mirrors the index shape every
-- other candidate/review table in this schema already uses
-- (devtunnel.ai_discovered_projects_status_idx, sql/020).
create index if not exists github_project_nominations_status_idx
  on devtunnel.github_project_nominations (status, created_at desc);

-- Same defense-in-depth posture every table in this schema takes
-- (sql/001 README): this backend is the trusted server-side boundary
-- and authorizes in code via the service role key, never via RLS + a
-- user JWT, so anon/authenticated get no grants at all.
alter table devtunnel.github_project_nominations enable row level security;
revoke all on devtunnel.github_project_nominations from anon, authenticated;