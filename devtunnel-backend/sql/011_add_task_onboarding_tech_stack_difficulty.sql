-- DevTunnel — Admin Task Onboarding, Step 4 ("Fetch Project Tech Stack")
-- and Step 5 ("Difficulty") — admin_workflow.txt section 10; section 25
-- ("Task Onboarding State").
--
-- Extends devtunnel.task_onboarding_drafts (sql/009, sql/010) with exactly
-- the columns Steps 4–5 need. Per Backend_Development_Rules.txt rule 5,
-- this does NOT add columns for Steps 6–7 (issue preview, final
-- validation/completion) — those get their own migration(s) when they're
-- built, same convention sql/009/sql/010's headers already set.
--
-- Run once, after 010_add_task_onboarding_issue.sql.

-- ---------------------------------------------------------------------------
-- Step 4 — Fetch Project Tech Stack
--
-- `tech_stack` is a jsonb snapshot of the *project's own* already-recorded
-- tech stack (`devtunnel.projects.tech_stack`, sql/006 — populated during
-- Project Onboarding Step 3), copied onto the draft at attachment time —
-- "Attach [the project's tech stack] to Task Onboarding," never a second,
-- independently-detected tech stack for the task itself. Snapshotting
-- rather than re-reading the project on every draft view means an edit to
-- the project's tech stack after this step doesn't silently change what
-- the admin already reviewed for this specific task (same reasoning as
-- `github_issue` in sql/010).
--
-- `tech_stack_loaded` is section 25's fourth backend-authoritative
-- onboarding-state boolean, only ever flipped by the backend, same
-- posture as `project_selected` / `issue_selected`.
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists tech_stack       jsonb,
  add column if not exists tech_stack_loaded boolean not null default false;

-- Whole snapshot or nothing — same consistency posture as sql/010's
-- issue-selection constraint (rule 25: database constraints, not just
-- application code, keep these two columns in sync).
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_tech_stack_consistent;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_tech_stack_consistent
  check (
    (tech_stack_loaded = false and tech_stack is null)
    or
    (tech_stack_loaded = true and tech_stack is not null)
  );

-- ---------------------------------------------------------------------------
-- Step 5 — Difficulty
--
-- `curation_role` / `curation_difficulty` reuse the exact enum values
-- `devtunnel.users.developer_role` / `experience_level` already define
-- (sql/002) — "Use the exact difficulty values already defined by the
-- current source/schema if they exist" — rather than inventing a second
-- vocabulary for the same concept.
--
-- `difficulty_defined` is section 25's fifth backend-authoritative
-- boolean.
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists curation_role       text,
  add column if not exists curation_difficulty text,
  add column if not exists difficulty_defined  boolean not null default false;

alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_curation_role_check;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_curation_role_check
  check (curation_role is null or curation_role in
    ('FRONTEND', 'BACKEND', 'FULL_STACK', 'DOCUMENTATION', 'TESTING', 'DEVOPS'));

alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_curation_difficulty_check;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_curation_difficulty_check
  check (curation_difficulty is null or curation_difficulty in
    ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'));

-- Both curation fields are set together or not at all.
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_difficulty_consistent;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_difficulty_consistent
  check (
    (difficulty_defined = false and curation_role is null and curation_difficulty is null)
    or
    (difficulty_defined = true and curation_role is not null and curation_difficulty is not null)
  );