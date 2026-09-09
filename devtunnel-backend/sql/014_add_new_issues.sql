-- DevTunnel — Admin "New Issues" section (admin_workflow.txt section 9 —
-- "DevTunnel Task Lifecycle"; section 16 — "New Issues Section"; section
-- 17 — "New Issues Flow"; section 22 — Admin Backend API Map:
-- `GET /admin/new-issues`, `POST /admin/new-issues/:id/ignore`).
--
-- The New Issues page is fully built in the frontend
-- (devtunnel-frontend/src/app/admin/(protected)/tasks/new-issues/**) but
-- has no backend today. A "new issue" itself (an open GitHub issue not
-- yet covered by a `devtunnel.tasks` row) is never persisted — it's
-- computed on every `GET /admin/new-issues` request by diffing GitHub's
-- live issue list against `devtunnel.tasks.github_issue_number`
-- (sql/012), the same "GitHub remains the source of truth" posture
-- `getProjectGithubRepoRef` already documents (src/db/adminProjects.ts).
--
-- The one thing this feature DOES need to persist is "ignored" — an
-- explicit DevTunnel-side decision that has no GitHub-side counterpart
-- (ignoring must never modify, close, or comment on the actual GitHub
-- issue — section 15's "the GitHub issue is not deleted just because the
-- DevTunnel representation is deleted" applies the same way here). Hence
-- this single new table.
--
-- Run once, after 013_add_admin_task_management.sql.

-- ---------------------------------------------------------------------------
-- devtunnel.ignored_github_issues — one row per (project, GitHub issue
-- number) an admin has chosen to hide from `GET /admin/new-issues`
-- (src/db/adminNewIssues.ts `ignoreNewIssue` /
-- `getIgnoredIssueKeysByProject`).
--
-- Identified by `(project_id, github_issue_number)`, NOT `id` alone, and
-- deliberately does not reference `devtunnel.tasks` in any way — an
-- ignored issue was never a DevTunnel task, so there is nothing task-
-- shaped to link to (client-api.ts's own comment on this: "an ignored
-- issue was never a DevTunnel task, so there is nothing to delete").
--
-- `ignored_by` is `on delete set null` (never `cascade`) — an admin
-- account being removed later must not silently un-ignore every issue
-- they previously ignored; the ignore itself stays in force, only the
-- "who did this" attribution is lost, same pattern
-- `devtunnel.tasks.deleted_by` (sql/013) already uses.
--
-- `project_id` IS `on delete cascade` — DevTunnel never physically
-- deletes a project (`delete_admin_project`, sql/008, is a soft delete),
-- so this cascade only ever fires if a project row is removed outside
-- the normal application path (e.g. manual cleanup); an ignore entry for
-- a project that no longer exists at all has nothing left to apply to.
--
-- `unique (project_id, github_issue_number)` makes "ignore" naturally
-- idempotent — re-ignoring an already-ignored issue is a harmless no-op
-- via `on conflict do nothing` (src/db/adminNewIssues.ts), never a
-- constraint-violation error surfaced to the admin (rule 55: operations
-- that can reasonably be retried should be idempotent).
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.ignored_github_issues (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references devtunnel.projects (id) on delete cascade,
  github_issue_number integer not null check (github_issue_number > 0),
  ignored_by          uuid references devtunnel.users (id) on delete set null,
  ignored_at          timestamptz not null default now(),

  constraint ignored_github_issues_project_issue_key unique (project_id, github_issue_number)
);

-- Every read of this table (`GET /admin/new-issues`'s ignored-set lookup)
-- filters by `project_id`, across the same set of active projects being
-- scanned for new issues — index the FK the same way every other
-- project-scoped table in this schema does.
create index if not exists ignored_github_issues_project_idx
  on devtunnel.ignored_github_issues (project_id);