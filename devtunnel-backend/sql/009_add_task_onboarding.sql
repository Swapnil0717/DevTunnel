-- DevTunnel — Admin Task Onboarding, Step 1 only (admin_workflow.txt
-- section 10 — "Create Task — Task Onboarding"; section 25 — "Task
-- Onboarding State").
--
-- Adds devtunnel.task_onboarding_drafts — the mandatory multi-step task
-- wizard's working state, same role for tasks that
-- devtunnel.project_onboarding_drafts (sql/006) plays for projects. A row
-- here NEVER represents a real DevTunnel task — only a future
-- `complete_task_onboarding()` function will ever turn one into a row in
-- `devtunnel.tasks`, and only once every mandatory step has genuinely
-- completed (section 25: "Do not let the frontend determine whether
-- onboarding is complete. Backend should maintain the state.").
--
-- Run once, after 008_add_project_soft_delete.sql.
--
-- Per Backend_Development_Rules.txt rule 5, this migration only adds the
-- columns Step 1 ("Project Selection") actually needs:
--   project_id         — the selected project
--   project_selected   — section 25's first backend-authoritative flag
--   completed_task_id  — reserved so this table's shape can be extended by
--                        later migrations rather than replaced
-- It deliberately does NOT add columns for Steps 2–7 (issue selection,
-- issue information, tech-stack attachment, difficulty/role curation,
-- preview, validation) — those are separate, not-yet-implemented backend
-- routes and get their own migration(s) (`ALTER TABLE ... ADD COLUMN ...`)
-- when they're built, exactly as this file's own header says for whoever
-- builds Step 2 next.

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- task_onboarding_drafts
--
-- One row per in-progress (or completed) task-onboarding wizard run.
-- `admin_id` scopes every draft to the admin who started it —
-- src/db/taskOnboarding.ts always filters by both `id` and `admin_id` so
-- one admin can never read or mutate another admin's draft
-- (Backend_Development_Rules.txt rule 13: prevent IDOR by verifying
-- ownership, not just resource existence). Same convention as
-- project_onboarding_drafts (sql/006).
--
-- `project_id` is set exclusively by Step 1 (`POST /admin/tasks/onboarding`)
-- after the backend has independently re-verified the project is eligible
-- (ACTIVE and not soft-deleted) — never trusted purely because the admin
-- picked it from the `GET .../projects` list (rule 15: never trust
-- frontend validation, re-check server-side).
--
-- `project_selected` is section 25's first authoritative onboarding-state
-- boolean, only ever flipped by the backend (never accepted as request
-- input) — src/db/taskOnboarding.ts is the sole writer, same posture as
-- project_onboarding_drafts's `*_completed` columns.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.task_onboarding_drafts (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid not null references devtunnel.users (id) on delete cascade,

  -- Step 1 — Project Selection
  project_id         uuid not null references devtunnel.projects (id) on delete cascade,
  project_selected   boolean not null default false,

  -- Set only by a future complete_task_onboarding() (Step 7); a non-null
  -- value means this draft has already produced a real task and must
  -- never be re-completed or re-selected over (rule 55: idempotent
  -- creation), mirroring project_onboarding_drafts.completed_project_id.
  completed_task_id  uuid references devtunnel.tasks (id) on delete set null,
  completed_at       timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists task_onboarding_drafts_admin_id_idx
  on devtunnel.task_onboarding_drafts (admin_id);

create index if not exists task_onboarding_drafts_project_id_idx
  on devtunnel.task_onboarding_drafts (project_id);

drop trigger if exists task_onboarding_drafts_set_updated_at on devtunnel.task_onboarding_drafts;
create trigger task_onboarding_drafts_set_updated_at
  before update on devtunnel.task_onboarding_drafts
  for each row execute function devtunnel.set_updated_at();

alter table devtunnel.task_onboarding_drafts enable row level security;
revoke all on devtunnel.task_onboarding_drafts from anon, authenticated;