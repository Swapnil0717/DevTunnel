-- DevTunnel — Admin Project Onboarding (admin_workflow.txt section 6)
--
-- Adds:
--   1. devtunnel.project_onboarding_drafts — the mandatory multi-step
--      wizard's working state ("Onboarding Draft, not the final project").
--      A row here NEVER represents an active DevTunnel project — only
--      `complete_project_onboarding()` below ever turns one into a row in
--      `devtunnel.projects`, and only once every mandatory step has
--      genuinely completed (section 24 — "Do not let the frontend
--      determine whether onboarding is complete. Backend should maintain
--      the state.").
--   2. GitHub-sourced columns on devtunnel.projects — repository
--      metadata, README, author/contributor snapshot, tech stack, and the
--      Admin's description choice — everything section 6/7's "Project
--      Creation Algorithm" says must be stored when the project becomes
--      ACTIVE.
--
-- Run once, after 005_add_admin_audit_log.sql.
--
-- Per Backend_Development_Rules.txt rule 5, this migration only adds the
-- schema this feature (Project Onboarding) actually needs — it does not
-- add tables for Task Onboarding, GitHub sync, or New Issues, which are
-- separate, not-yet-requested admin_workflow.txt sections.

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'onboarding_description_choice' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.onboarding_description_choice as enum ('EXISTING', 'CUSTOM');
  end if;

  -- "Status" per admin_workflow.txt section 4's Projects table column.
  -- Only 'ACTIVE' is produced by this migration's algorithm (a project
  -- only ever comes into existence already active — section 24); the
  -- enum is left room to grow (e.g. an eventual archive/suspend flow)
  -- without another migration, per rule 90 (meaningful string values,
  -- not a bare boolean/int).
  if not exists (
    select 1 from pg_type where typname = 'project_status' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.project_status as enum ('ACTIVE');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- project_onboarding_drafts
--
-- One row per in-progress (or completed) onboarding wizard run. `admin_id`
-- scopes every draft to the admin who started it — src/db/projectOnboarding.ts
-- always filters by both `id` and `admin_id` so one admin can never read or
-- mutate another admin's draft (Backend_Development_Rules.txt rule 13:
-- prevent IDOR by verifying ownership, not just resource existence).
--
-- `repository_*`, `github_author`, `github_contributors` are populated
-- exclusively by Step 1 (POST .../repository) from GitHub's own API —
-- never client-typed (section 6, Step 1: "Admin should not manually
-- enter... These should come from GitHub."). `github_author` /
-- `github_contributors` mirror `OnboardingGithubIdentity` in
-- devtunnel-frontend/src/lib/admin/project-onboarding/types.ts:
-- { username, name, avatarUrl, profileUrl }.
--
-- The five `*_completed` booleans are section 24's authoritative
-- onboarding state, only ever flipped by the backend (never accepted as
-- request input) — src/db/projectOnboarding.ts is the sole writer.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.project_onboarding_drafts (
  id                      uuid primary key default gen_random_uuid(),
  admin_id                uuid not null references devtunnel.users (id) on delete cascade,

  -- Step 1 — Import GitHub Repository
  repository_url          text,
  github_owner            text,
  github_repo_name        text,
  github_full_name        text,
  github_description      text,
  readme                  text,
  default_branch          text,
  primary_language        text,
  stars                   integer,
  forks                   integer,
  open_issues             integer,
  github_author           jsonb,
  github_contributors     jsonb not null default '[]'::jsonb,
  has_github_app_access   boolean not null default false,
  repository_completed    boolean not null default false,

  -- Step 2 — Project Description
  description_choice      devtunnel.onboarding_description_choice,
  custom_description      text,
  description_completed   boolean not null default false,

  -- Step 3 — Project Tech Stack
  tech_stack               jsonb,
  tech_stack_completed      boolean not null default false,

  -- Step 4 — Project Preview (a checkpoint, not new data of its own)
  preview_completed        boolean not null default false,

  -- Step 5 — Final Validation / Confirmation
  validation_completed     boolean not null default false,

  -- Set only by complete_project_onboarding(); a non-null value means
  -- this draft has already produced an active project and must never be
  -- re-completed or re-imported over (rule 55: idempotent creation).
  completed_project_id    uuid references devtunnel.projects (id) on delete set null,
  completed_at            timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists project_onboarding_drafts_admin_id_idx
  on devtunnel.project_onboarding_drafts (admin_id);

drop trigger if exists project_onboarding_drafts_set_updated_at on devtunnel.project_onboarding_drafts;
create trigger project_onboarding_drafts_set_updated_at
  before update on devtunnel.project_onboarding_drafts
  for each row execute function devtunnel.set_updated_at();

alter table devtunnel.project_onboarding_drafts enable row level security;
revoke all on devtunnel.project_onboarding_drafts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- devtunnel.projects — extend with GitHub-sourced + onboarding-curated
-- columns (section 7's "Create Project -> Associate Author -> Associate
-- Repository -> Store Description -> Store Tech Stack -> Store repository
-- metadata -> Project = ACTIVE").
--
-- `github_full_name` is the stable "owner/repo" identity of the imported
-- repository; the partial unique index below stops the same GitHub
-- repository from being onboarded into two separate DevTunnel projects,
-- without constraining any pre-existing row that predates this migration
-- and has no GitHub import behind it.
-- ---------------------------------------------------------------------------
alter table devtunnel.projects
  add column if not exists github_owner            text,
  add column if not exists github_repo_name         text,
  add column if not exists github_full_name         text,
  add column if not exists github_description       text,
  add column if not exists readme                   text,
  add column if not exists default_branch           text,
  add column if not exists primary_language         text,
  add column if not exists stars                    integer not null default 0,
  add column if not exists forks                    integer not null default 0,
  add column if not exists open_issues               integer not null default 0,
  add column if not exists github_author            jsonb,
  add column if not exists github_contributors      jsonb not null default '[]'::jsonb,
  add column if not exists description_source       devtunnel.onboarding_description_choice,
  add column if not exists custom_description       text,
  add column if not exists tech_stack               jsonb not null default '{}'::jsonb,
  add column if not exists status                   devtunnel.project_status not null default 'ACTIVE',
  add column if not exists onboarding_draft_id       uuid references devtunnel.project_onboarding_drafts (id) on delete set null;

create unique index if not exists projects_github_full_name_key
  on devtunnel.projects (github_full_name)
  where github_full_name is not null;

create index if not exists projects_status_idx on devtunnel.projects (status);

-- ---------------------------------------------------------------------------
-- complete_project_onboarding — the only path that ever turns a draft into
-- a real, ACTIVE project (section 7's "Project Creation Backend"
-- algorithm). Runs as a single atomic transaction so a concurrent request
-- (double-click on "Create Project", a retried network request) can never
-- create two projects from the same draft or leave a half-created project
-- behind (Backend_Development_Rules.txt rule 26: use transactions; rule 55:
-- make creation idempotent; rule 74: handle race conditions).
--
-- `select ... for update` row-locks the draft for the duration of the
-- transaction, so a second concurrent call blocks until the first commits
-- — at which point `completed_project_id is not null` and it cleanly
-- raises ONBOARDING_ALREADY_COMPLETED instead of creating a duplicate.
--
-- Re-validates every step server-side from the draft's actual stored
-- data (never trusts that `validation_completed` alone is still accurate)
-- — the same "backend is the final security boundary" posture as every
-- other check in this codebase (rule 10), applied to business-rule
-- validation, not just authn/authz.
--
-- Ownership (`admin_id = p_admin_id`) is checked here too, not only in
-- application code, so this function is safe to call with any admin_id
-- the caller can prove (rule 13: prevent IDOR).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.complete_project_onboarding(
  p_draft_id uuid,
  p_admin_id uuid
)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
declare
  v_draft   devtunnel.project_onboarding_drafts%rowtype;
  v_base_slug text;
  v_slug      text;
  v_suffix    integer := 1;
  v_project_id uuid;
begin
  select * into v_draft
  from devtunnel.project_onboarding_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.admin_id <> p_admin_id then
    -- Reported identically to "not found" by the caller (never reveal
    -- that a draft exists for a different admin — rule 13).
    raise exception 'ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.completed_project_id is not null then
    raise exception 'ONBOARDING_ALREADY_COMPLETED';
  end if;

  if not (
    v_draft.repository_completed
    and v_draft.description_completed
    and v_draft.tech_stack_completed
    and v_draft.preview_completed
    and v_draft.validation_completed
    and v_draft.has_github_app_access
    and v_draft.github_full_name is not null
  ) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  -- Another draft may have raced this one to onboard the same repository
  -- between Step 1 and now; the partial unique index on
  -- projects.github_full_name is the real guard, but checking here first
  -- gives a clean, specific error instead of a generic constraint-
  -- violation 500.
  if exists (
    select 1 from devtunnel.projects
    where github_full_name = v_draft.github_full_name
  ) then
    raise exception 'REPOSITORY_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(coalesce(v_draft.github_repo_name, 'project'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'project';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from devtunnel.projects where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into devtunnel.projects (
    name,
    slug,
    description,
    repo_url,
    created_by,
    github_owner,
    github_repo_name,
    github_full_name,
    github_description,
    readme,
    default_branch,
    primary_language,
    stars,
    forks,
    open_issues,
    github_author,
    github_contributors,
    description_source,
    custom_description,
    tech_stack,
    status,
    onboarding_draft_id
  ) values (
    v_draft.github_repo_name,
    v_slug,
    case when v_draft.description_choice = 'CUSTOM' then v_draft.custom_description else v_draft.github_description end,
    v_draft.repository_url,
    p_admin_id,
    v_draft.github_owner,
    v_draft.github_repo_name,
    v_draft.github_full_name,
    v_draft.github_description,
    v_draft.readme,
    v_draft.default_branch,
    v_draft.primary_language,
    coalesce(v_draft.stars, 0),
    coalesce(v_draft.forks, 0),
    coalesce(v_draft.open_issues, 0),
    v_draft.github_author,
    v_draft.github_contributors,
    v_draft.description_choice,
    v_draft.custom_description,
    coalesce(v_draft.tech_stack, '{}'::jsonb),
    'ACTIVE',
    v_draft.id
  )
  returning devtunnel.projects.id into v_project_id;

  update devtunnel.project_onboarding_drafts
  set completed_project_id = v_project_id,
      completed_at = now()
  where devtunnel.project_onboarding_drafts.id = v_draft.id;

  return query
    select p.id, p.slug, p.name from devtunnel.projects p where p.id = v_project_id;
end;
$$;