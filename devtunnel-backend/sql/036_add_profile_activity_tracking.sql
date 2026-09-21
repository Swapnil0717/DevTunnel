-- DevTunnel — profile activity tracking: "tasks I've viewed" and "GitHub
-- catalog repositories I've joined".
--
-- Backs the contributor Profile page's Projects and Tasks tabs
-- (devtunnel-frontend `components/profile/profile-tabs.tsx`) through:
--   * POST /tasks/:id/view                    (src/routes/profileActivity.ts)
--   * GET  /users/me/profile-activity         (src/routes/profileActivity.ts)
--   * POST /github-projects/:slug/contribute  (src/routes/githubCatalogContribute.ts)
--   * POST /github-open-source-tools/:slug/contribute (same file)
--
-- Run once, after 035_add_settings.sql.
--
-- Everything else the Profile page shows already has a table behind it and
-- needs no migration here:
--   * "tasks I started"            — devtunnel.tasks.assignee_* (sql/030)
--   * "tasks I submitted for review" — devtunnel.pull_requests (sql/031)
--   * "tasks I completed"          — devtunnel.tasks.completed_at (sql/004)
--   * "DevTunnel projects I joined" — devtunnel.project_contributors (sql/026)
--   * "DevTunnel tools I joined"    — devtunnel.opensource_tool_contributors (sql/026)
--
-- ---------------------------------------------------------------------------
-- WHAT A ROW IN EITHER TABLE MEANS, AND DOES NOT MEAN
--
-- Like sql/026, these rows record *intent / attention*, never delivered
-- work. Nothing here feeds `devtunnel_contributor_count` (sql/015) or
-- `devtunnel.activity_log` (sql/004): a task someone merely opened, or a
-- repository someone clicked "Contribute" on, is not a contribution and
-- must not move a contribution calendar or a contributor count.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- task_views — which tasks a contributor has opened the detail page of.
--
-- One row per (task, user): opening the same task again only moves
-- `last_viewed_at`; `first_viewed_at` keeps saying when they first saw it.
-- That is what makes recording a view idempotent under a refresh, a
-- double-invoked effect, or two open tabs (rule 55).
--
-- Both foreign keys cascade: a hard-deleted task or user leaves no orphaned
-- view rows. `devtunnel.tasks` is soft-deleted in practice (`deleted_at`),
-- so the profile query filters on that itself.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.task_views (
  task_id          uuid not null references devtunnel.tasks (id) on delete cascade,
  user_id          uuid not null references devtunnel.users (id) on delete cascade,
  first_viewed_at  timestamptz not null default now(),
  last_viewed_at   timestamptz not null default now(),

  primary key (task_id, user_id)
);

-- "Which tasks has this contributor seen, most recent first?" — the lookup
-- direction the composite primary key (which leads with task_id) can't serve.
create index if not exists task_views_user_last_viewed_idx
  on devtunnel.task_views (user_id, last_viewed_at desc);

-- ---------------------------------------------------------------------------
-- github_repo_contributors — "I clicked Contribute" on a repository that is
-- still in one of the two raw GitHub catalogs (`/github-projects`,
-- `/github-open-source-tools`).
--
-- Those repositories are NOT rows in devtunnel.projects /
-- devtunnel.opensource_tools yet (they are read live from GitHub and cached),
-- so sql/026's tables — which foreign-key to those — can't hold the join.
-- The repository is identified the same way `github_stars` (sql/025) does:
-- by its GitHub `owner/repo` name, not by a DevTunnel id.
--
-- `catalog` records which page the join came from, so the Profile can link
-- back to the right detail page. The same repository can legitimately be in
-- both catalogs (their discovery queries are independent), so it is part of
-- the key rather than a property of the repository.
--
-- `repository_key` is the lower-cased `owner/repo`. GitHub names are
-- case-insensitive but the catalog slugs are lower-cased, so keying on the
-- lower-cased form makes "joined?" a plain equality check. The display form
-- GitHub reports (`repository_full_name`) is stored separately.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.github_repo_contributors (
  user_id               uuid not null references devtunnel.users (id) on delete cascade,
  catalog               text not null check (catalog in ('project', 'tool')),
  repository_key        text not null,
  repository_full_name  text not null,
  repository_url        text not null,
  joined_at             timestamptz not null default now(),

  primary key (user_id, catalog, repository_key)
);

create index if not exists github_repo_contributors_user_joined_idx
  on devtunnel.github_repo_contributors (user_id, joined_at desc);

-- ---------------------------------------------------------------------------
-- Access control — identical posture to every other table in this schema
-- (sql/001): this backend talks to Supabase with the service role key, which
-- bypasses RLS; RLS is enabled with no policies as defense in depth so the
-- anon/authenticated roles get zero access even if the schema is accidentally
-- exposed.
-- ---------------------------------------------------------------------------
alter table devtunnel.task_views enable row level security;
alter table devtunnel.github_repo_contributors enable row level security;

revoke all on devtunnel.task_views from anon, authenticated;
revoke all on devtunnel.github_repo_contributors from anon, authenticated;