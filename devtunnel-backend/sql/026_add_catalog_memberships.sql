-- DevTunnel — "Contribute to this" membership for projects and tools
--
-- Backs the one genuinely new piece of state the two Detail pages need:
--   * POST /projects/:slug/contribute        (src/routes/projects.ts)
--   * POST /opensource-tools/:slug/contribute (src/routes/openSourceTools.ts)
-- and the `viewerIsContributing` flag both detail payloads carry.
--
-- Run once, after 025_add_github_stars.sql.
--
-- Per Backend_Development_Rules.txt rule 5, this migration adds only what
-- these two endpoints actually need. In particular it does NOT add:
--   * any column to devtunnel.projects or devtunnel.opensource_tools —
--     both Detail routes read the columns those tables already have;
--   * a new reporting view — the contributor Project Detail route reads
--     task/contributor counts off the existing devtunnel.admin_project_list
--     view (sql/015), the same way src/db/tasks.ts already reads the
--     admin_task_list view for the contributor Tasks page rather than
--     defining a second, divergent copy of the same aggregates.
--
-- ---------------------------------------------------------------------------
-- WHAT "JOINING" MEANS, AND WHAT IT DELIBERATELY DOES NOT MEAN
--
-- A row here records that a contributor has said "I want to work on
-- this". That is NOT the same fact as `admin_project_list`'s
-- `devtunnel_contributor_count`, which counts people who have actually
-- completed a task or landed a merged pull request on the project
-- (sql/015). Intent and delivered work are two different things, and
-- collapsing them would inflate every project's contributor count with
-- people who clicked a button once (rule 38: never fake a metric).
--
-- So: joining never increments that count, and nothing in this migration
-- touches devtunnel.activity_log either — there is no contribution to
-- log yet. The count moves when the work lands, through the tables it
-- already reads.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- project_contributors — who has joined which DevTunnel project.
--
-- Composite primary key (project_id, user_id) makes the join naturally
-- idempotent: a contributor double-clicking "Contribute to this project",
-- or a retried request, conflicts on the key and is absorbed by the
-- route's `on conflict do nothing` upsert instead of creating a second
-- row (rule 55: make creation idempotent).
--
-- Both foreign keys cascade on delete: a deleted user or a hard-deleted
-- project leaves no orphaned membership rows behind. Note
-- devtunnel.projects is soft-deleted in practice (`deleted_at`), so the
-- cascade is a safety net, not the normal path — the routes filter on
-- `deleted_at is null` themselves.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.project_contributors (
  project_id  uuid not null references devtunnel.projects (id) on delete cascade,
  user_id     uuid not null references devtunnel.users (id) on delete cascade,
  joined_at   timestamptz not null default now(),

  primary key (project_id, user_id)
);

-- "Which projects has this contributor joined?" — the lookup direction
-- the composite primary key's index can't serve (it leads with
-- project_id). Needed for any future "your projects" view; the two
-- endpoints in this change only ever query the other direction.
create index if not exists project_contributors_user_id_idx
  on devtunnel.project_contributors (user_id);

-- ---------------------------------------------------------------------------
-- opensource_tool_contributors — the same fact for a curated tool.
--
-- A separate table rather than one polymorphic (`entity_type`,
-- `entity_id`) table on purpose: a polymorphic key can't have a real
-- foreign key to either table, which is exactly the integrity this pair
-- of constraints is here to provide.
--
-- `opensource_tools` is hard-deleted rather than soft-deleted (see
-- deleteAdminOpenSourceTool's "Delete semantics" comment in
-- src/db/adminOpenSourceTools.ts), so the cascade here is the normal
-- path, not a safety net.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.opensource_tool_contributors (
  tool_id     uuid not null references devtunnel.opensource_tools (id) on delete cascade,
  user_id     uuid not null references devtunnel.users (id) on delete cascade,
  joined_at   timestamptz not null default now(),

  primary key (tool_id, user_id)
);

create index if not exists opensource_tool_contributors_user_id_idx
  on devtunnel.opensource_tool_contributors (user_id);

-- ---------------------------------------------------------------------------
-- Access control — identical posture to every other table in this schema
-- (sql/001): this backend talks to Supabase with the service role key,
-- which bypasses RLS; RLS is enabled with no policies as defense in depth
-- so the anon/authenticated roles get zero access even if the schema is
-- accidentally exposed.
-- ---------------------------------------------------------------------------
alter table devtunnel.project_contributors enable row level security;
alter table devtunnel.opensource_tool_contributors enable row level security;

revoke all on devtunnel.project_contributors from anon, authenticated;
revoke all on devtunnel.opensource_tool_contributors from anon, authenticated;