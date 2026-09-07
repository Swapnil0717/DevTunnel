-- DevTunnel — Admin Projects List (admin_workflow.txt section 4 —
-- "Projects Page"; section 22 — "GET /admin/projects", "GET
-- /admin/projects/:id").
--
-- Adds:
--   1. A missing index on `devtunnel.pull_requests (project_id)` — the
--      table already has indexes on `author_id`/`status`
--      (004_add_devtunnel_contributions.sql) but not the column this
--      migration's contributor aggregation groups by.
--   2. `devtunnel.admin_project_list` — a read-only view that pre-joins
--      each project with its task count and DevTunnel-contributor count,
--      so `GET /admin/projects` can page through every project with one
--      query instead of N+1 per-project lookups (Backend_Development_
--      Rules.txt rule 21: pagination/large collections must actually
--      scale).
--
-- Run once, after 006_add_project_onboarding.sql.
--
-- Per rule 5, this migration only adds what `GET /admin/projects` /
-- `GET /admin/projects/:id` actually need — it does not add the separate
-- `/admin/projects/:id/contributors` or `/admin/projects/:id/github-
-- contributors` detail routes (section 22), which are their own,
-- not-yet-requested feature.

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- Missing index: the DevTunnel-contributor aggregation below groups
-- `pull_requests` by `project_id`, which had no supporting index.
-- ---------------------------------------------------------------------------
create index if not exists pull_requests_project_id_idx
  on devtunnel.pull_requests (project_id);

-- ---------------------------------------------------------------------------
-- admin_project_list — one row per DevTunnel project, joined with:
--
--   github_contributor_count  — length of the GitHub contributor snapshot
--                                captured at onboarding time
--                                (`projects.github_contributors`, sql/006).
--                                This is GitHub's own contributor list,
--                                never mixed with DevTunnel's (section 5).
--
--   task_count                — count of `devtunnel.tasks` rows for the
--                                project.
--
--   devtunnel_contributor_count — distinct count of users who either (a)
--                                are/were assigned a task on the project,
--                                or (b) authored a pull request tracked
--                                against the project (section 5's
--                                "DevTunnel contributor calculation":
--                                tasks -> assignees, submissions/PRs ->
--                                authors, deduplicated). There is no
--                                separate "submissions" table in this
--                                schema yet, so this uses the two
--                                DevTunnel-native tables that actually
--                                exist today (rule 5: never invent schema
--                                beyond what's built) — a future
--                                submissions table would be added as a
--                                third branch of the union below, not by
--                                fabricating a count now.
--
-- Deliberately read-only (no INSERT/UPDATE ever targets this view) and
-- selects an explicit column list of already-public-to-admin fields —
-- never `projects.*`, so a private/internal column added to `projects`
-- later (e.g. an eventual encrypted field) is never accidentally exposed
-- through this view without a conscious edit here (rule 8).
-- ---------------------------------------------------------------------------
create or replace view devtunnel.admin_project_list as
select
  p.id,
  p.slug,
  p.name,
  p.repo_url,
  p.github_full_name,
  p.github_owner,
  p.github_author,
  p.status,
  p.created_at,
  case
    when jsonb_typeof(p.github_contributors) = 'array' then jsonb_array_length(p.github_contributors)
    else 0
  end as github_contributor_count,
  coalesce(task_counts.task_count, 0) as task_count,
  coalesce(contributor_counts.devtunnel_contributor_count, 0) as devtunnel_contributor_count
from devtunnel.projects p
left join (
  select project_id, count(*) as task_count
  from devtunnel.tasks
  group by project_id
) task_counts on task_counts.project_id = p.id
left join (
  select project_id, count(distinct user_id) as devtunnel_contributor_count
  from (
    select project_id, assignee_id as user_id
    from devtunnel.tasks
    where assignee_id is not null
    union
    select project_id, author_id as user_id
    from devtunnel.pull_requests
  ) devtunnel_contributors
  group by project_id
) contributor_counts on contributor_counts.project_id = p.id;

-- ---------------------------------------------------------------------------
-- Access control — same posture as every other table in this schema
-- (001/004/005/006): this backend talks to Supabase exclusively with the
-- service role key (src/lib/supabase.ts), which bypasses RLS/grants by
-- design. Views can't have RLS enabled directly, so the equivalent
-- defense-in-depth here is revoking table-level privileges from
-- anon/authenticated, same as every base table.
-- ---------------------------------------------------------------------------
revoke all on devtunnel.admin_project_list from anon, authenticated;