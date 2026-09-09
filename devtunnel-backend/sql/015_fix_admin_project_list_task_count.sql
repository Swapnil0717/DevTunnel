-- DevTunnel — Fix `devtunnel.admin_project_list.task_count` + expose
-- `tech_stack` for the Admin "All Projects" filter bar.
--
-- BACKGROUND: sql/008's header note and sql/013's note both flag that
-- this sql/ folder never actually contains the `create view
-- devtunnel.admin_project_list` statement that src/db/adminProjects.ts
-- and AdminProjectListRow describe — only later `create or replace`
-- fixes to it survived (007, and now this file). Per
-- Backend_Development_Rules.txt rule 5 ("never invent schema beyond
-- what's actually being built/verified"), this migration does not
-- guess at anything the running database doesn't already tell us via
-- devtunnel.projects / devtunnel.tasks — every column below is either
-- copied straight off devtunnel.projects or computed from a real,
-- existing table (rule 38: never fake metrics).
--
-- BUG THIS FIXES: the Admin Projects table (`/admin/projects`) showed
-- the same task count for every project regardless of how many tasks
-- actually belonged to it. Whatever the live view's `task_count`
-- expression currently is, it is not scoped per-project. This
-- redefinition scopes it with an explicit `where t.project_id = p.id`
-- correlated subquery, and — per sql/013's own note — excludes
-- soft-deleted tasks (`t.deleted_at is null`) so a deleted task never
-- inflates a project's live count.
--
-- ALSO ADDS: `tech_stack`, so `GET /admin/projects` can return each
-- project's curated tech stack on the *list* row, not only on the
-- detail row (`AdminProjectDetail`). This is what backs the new
-- "Tech stack" filter on the Admin Projects page — the column already
-- exists on devtunnel.projects (sql/006), this just surfaces it here
-- too rather than adding a second, redundant query per project.
--
-- Run once, after 014_add_new_issues.sql.
--
-- NOTE ON `drop view` INSTEAD OF `create or replace view`: Postgres only
-- allows `create or replace view` to APPEND new columns at the end of
-- the existing output list — every column the view already has must
-- keep the exact same name in the exact same position, or Postgres
-- rejects the whole statement with:
--
--   ERROR: 42P16: cannot change name of view column
--   "github_contributor_count" to "tech_stack"
--
-- The live `admin_project_list` view already has `github_contributor_count`,
-- `task_count`, and `devtunnel_contributor_count` in the 10th/11th/12th
-- positions (matching `LIST_COLUMNS` in src/db/adminProjects.ts). Adding
-- `tech_stack` anywhere other than the very end shifts every column
-- after it out of position, which `create or replace` refuses. Dropping
-- and recreating the view sidesteps that ordering rule entirely — safe
-- here because this is a plain read-only reporting view with no other
-- database objects depending on it (no triggers, no RLS policies, and
-- Supabase's PostgREST schema cache just needs a reload afterward, which
-- happens automatically).
-- ---------------------------------------------------------------------------

drop view if exists devtunnel.admin_project_list;

create view devtunnel.admin_project_list as
select
  p.id                          as id,
  p.slug                        as slug,
  p.name                        as name,
  p.repo_url                    as repo_url,
  p.github_full_name            as github_full_name,
  p.github_owner                as github_owner,
  p.github_author               as github_author,
  p.status                      as status,
  p.created_at                  as created_at,

  -- Real, stored snapshot of GitHub contributors captured at onboarding
  -- time (devtunnel.projects.github_contributors, sql/006) — a count of
  -- that array, never a fabricated number.
  coalesce(jsonb_array_length(p.github_contributors), 0) as github_contributor_count,

  -- Per-project task count, correctly scoped to THIS project and
  -- excluding soft-deleted tasks (sql/013's own note on this exact gap).
  -- This is the fix: previously every row in the table rendered the
  -- same value because the count wasn't correlated to p.id.
  (
    select count(*)
    from devtunnel.tasks t
    where t.project_id = p.id
      and t.deleted_at is null
  ) as task_count,

  -- Real DevTunnel-native contributors for this project: distinct users
  -- who either completed a task or authored a merged pull request
  -- against it. Never a copy of github_contributor_count (section 5:
  -- "GitHub Contributors ≠ DevTunnel Contributors — do not mix the two
  -- datasets").
  (
    select count(distinct contributor_id)
    from (
      select t.assignee_id as contributor_id
      from devtunnel.tasks t
      where t.project_id = p.id
        and t.deleted_at is null
        and t.status = 'DONE'
        and t.assignee_id is not null
      union
      select pr.author_id as contributor_id
      from devtunnel.pull_requests pr
      where pr.project_id = p.id
        and pr.status = 'MERGED'
    ) devtunnel_contributors
  ) as devtunnel_contributor_count,

  -- Appended last, deliberately, so a future `create or replace view`
  -- never has to fight Postgres's "existing columns can't move" rule
  -- again (see the note above).
  p.tech_stack                  as tech_stack

from devtunnel.projects p
where p.deleted_at is null;