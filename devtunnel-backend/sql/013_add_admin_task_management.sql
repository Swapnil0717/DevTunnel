-- DevTunnel — Admin "All Tasks" / "View Task" support (admin_workflow.txt
-- section 8 — "Task Section"; section 13 — "Task Page"; section 14 —
-- "People Doing Tasks"; section 15 — "Deleted DevTunnel Tasks / Issues";
-- section 22 — Admin Backend API Map, "Tasks": `GET /admin/tasks`,
-- `GET /admin/tasks/:id`, `PATCH /admin/tasks/:id`,
-- `DELETE /admin/tasks/:id`).
--
-- The Admin "View Task" / "All Tasks" pages are fully built in the
-- frontend (devtunnel-frontend/src/app/admin/(protected)/tasks/**) but
-- have no backend today — only Task Onboarding (sql/009-012) exists.
-- This migration adds exactly what those four routes need:
--
--   1. Soft-delete columns on devtunnel.tasks (mirrors sql/008's
--      soft-delete columns on devtunnel.projects) — section 15 is
--      explicit that deleting a DevTunnel task must never delete the
--      GitHub issue it came from, so this is a `deleted_at` marker, never
--      a physical row delete (Backend_Development_Rules.txt rule 86).
--   2. devtunnel.admin_task_list — a read-only view joining a task to its
--      project and to a real, computed submission count (never a
--      fabricated multi-contributor number — rule 38 "Never Fake
--      Metrics"; see the view's own comment below for why
--      Working/Completed stay derived from `status` + `assignee_id`
--      instead).
--   3. devtunnel.delete_admin_task — the guarded soft-delete RPC backing
--      `DELETE /admin/tasks/:id`, mirroring `delete_admin_project`
--      (sql/008) exactly: lock the row, check preconditions, raise a
--      specific exception per failure, mutate, return the result.
--
-- Run once, after 012_add_task_onboarding_preview_validation.sql.

-- ---------------------------------------------------------------------------
-- devtunnel.tasks — soft-delete columns (mirrors sql/008's
-- devtunnel.projects columns exactly, same naming/semantics).
-- ---------------------------------------------------------------------------
alter table devtunnel.tasks
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references devtunnel.users (id) on delete set null,
  add column if not exists delete_reason text;

-- Fast "active tasks only" scans elsewhere in the codebase (e.g. a future
-- project detail page's "Active Tasks" / "Completed Tasks" counts) — same
-- partial-index shape as projects_deleted_at_idx (sql/008).
create index if not exists tasks_deleted_at_idx
  on devtunnel.tasks (deleted_at)
  where deleted_at is null;

-- NOTE for whoever next touches devtunnel.admin_project_list (see
-- sql/008's own header note — that view's `create view` statement isn't
-- present in this sql/ folder, only later fixes to it): once you have
-- that view's real definition, its `task_count` aggregate should exclude
-- `t.deleted_at is not null` rows, the same way this migration's own
-- `admin_task_list` view below never surfaces a deleted task as if it
-- were still an active one.

-- ---------------------------------------------------------------------------
-- devtunnel.admin_task_list — read-only view backing `GET /admin/tasks`
-- and `GET /admin/tasks/:id` (src/db/adminTasks.ts). Joins each task to
-- its project (never a second, independent copy of project data — a task
-- has no tech stack, author, or repository of its own; section 26) and to
-- a real submission count computed from devtunnel.pull_requests.
--
-- Deliberately does NOT include soft-deleted tasks' "removal" from the
-- result set — section 15 requires Admin to be able to see tasks that
-- were deleted in DevTunnel while their GitHub issue still exists, so
-- `deleted_at` is surfaced as a column here, not filtered out. The route
-- layer (src/routes/admin/tasks.ts) is what decides which endpoints show
-- deleted rows (`GET /admin/tasks` — yes, matching the already-shipped
-- frontend's `AdminDeletedTasksTable`) versus which reject them
-- (`GET /admin/tasks/:id`, `PATCH /admin/tasks/:id` — a deleted task's
-- DevTunnel representation is gone, so its detail/edit routes 404 the
-- same way `getAdminProjectDetailById` does for a deleted project).
--
-- Working/Completed contributor counts are intentionally NOT a second,
-- fabricated "contributor list" table — `devtunnel.tasks` only ever
-- records a single `assignee_id` (sql/004) and there is no
-- multi-contributor/submission-tracking table beyond the real
-- `devtunnel.pull_requests` rows. Rule 38 ("Never Fake Metrics") and rule
-- 37 ("Public Data Must Be Accurate") apply here just as much as to
-- public-facing data: the honest working/completed count for this schema
-- is 0 or 1 (whether the single assignee is actively working or has
-- finished), computed from `status` + `assignee_id` at the application
-- layer (src/db/adminTasks.ts `toAdminTaskSummary`) rather than invented
-- here as a bogus multi-person number. `submissionCount`, by contrast, IS
-- a real many-valued count — every `devtunnel.pull_requests` row with
-- this `task_id`, regardless of status — so it's computed here, in SQL,
-- as a genuine aggregate.
-- ---------------------------------------------------------------------------
create or replace view devtunnel.admin_task_list as
select
  t.id                     as id,
  t.slug                   as slug,
  t.title                  as title,
  t.status                 as status,
  t.role                   as role,
  t.difficulty             as difficulty,
  t.assignee_id            as assignee_id,
  t.github_issue_number    as github_issue_number,
  t.github_issue_url       as github_issue_url,
  t.github_issue_snapshot  as github_issue_snapshot,
  t.custom_description     as custom_description,
  t.deleted_at             as deleted_at,
  t.created_at             as created_at,
  p.id                     as project_id,
  p.slug                   as project_slug,
  p.name                   as project_name,
  p.repo_url               as project_repo_url,
  p.github_full_name       as project_github_full_name,
  p.github_author          as project_github_author,
  p.github_owner           as project_github_owner,
  p.tech_stack             as project_tech_stack,
  coalesce(pr.submission_count, 0) as submission_count
from devtunnel.tasks t
join devtunnel.projects p on p.id = t.project_id
left join (
  select pull.task_id, count(*) as submission_count
  from devtunnel.pull_requests pull
  where pull.task_id is not null
  group by pull.task_id
) pr on pr.task_id = t.id;

-- ---------------------------------------------------------------------------
-- delete_admin_task — the actual soft delete backing
-- `DELETE /admin/tasks/:id`. Mirrors `delete_admin_project` (sql/008)
-- exactly: `select ... for update` row-locks the task so a concurrent
-- double-delete can't race, raises a specific exception per precondition
-- failure (never a generic constraint-violation 500), mutates, returns
-- the result.
--
-- Never physically deletes the row, and never touches
-- `github_issue_number` / `github_issue_url` / `github_issue_snapshot` —
-- those three columns are exactly what lets the deleted-tasks view keep
-- showing "Issue #, Issue Title" after this runs (section 15: "The
-- GitHub issue is not deleted just because the DevTunnel representation
-- is deleted").
-- ---------------------------------------------------------------------------
create or replace function devtunnel.delete_admin_task(
  p_task_id uuid,
  p_admin_id uuid,
  p_reason   text default null
)
returns table (id uuid, slug text, title text, deleted_at timestamptz)
language plpgsql
as $$
declare
  v_task devtunnel.tasks%rowtype;
begin
  select * into v_task
  from devtunnel.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  if v_task.deleted_at is not null then
    raise exception 'TASK_ALREADY_DELETED';
  end if;

  update devtunnel.tasks t
  set deleted_at    = now(),
      deleted_by    = p_admin_id,
      delete_reason = p_reason
  where t.id = p_task_id;

  return query
    select t.id, t.slug, t.title, t.deleted_at
    from devtunnel.tasks t
    where t.id = p_task_id;
end;
$$;