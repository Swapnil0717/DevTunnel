-- DevTunnel — per-contributor progress through the Contribute page's
-- submission checklist.
--
-- Backs the two write endpoints the Contribute page needs:
--   * PUT /projects/:slug/contribute/progress          (src/routes/contribute.ts)
--   * PUT /opensource-tools/:slug/contribute/progress  (src/routes/contribute.ts)
-- and the `completedSteps` array both GET /…/contribute payloads carry.
--
-- Run once, after 026_add_catalog_memberships.sql.
--
-- Per Backend_Development_Rules.txt rule 5 this adds only what those
-- endpoints need. In particular it does NOT add:
--   * anything describing the *ways* to contribute. That catalog (fix a
--     bug, write docs, triage issues …) is the same list for every
--     project on the platform and is static content the frontend already
--     ships in lib/contribute/contribution-ways.ts. Storing twenty fixed
--     rows in Postgres so the API can read them back would make a
--     content edit a migration (rule 5, and rule 38 — nothing here would
--     be a fact about a particular project).
--   * anything about CONTRIBUTING.md, good-first-issue counts, or the
--     repository's own contribution guide. Those live on GitHub, change
--     without telling us, and are read live and cached in KV by
--     src/lib/contributionGuide.ts. A snapshot column would go stale
--     silently and be presented as current (rule 21).
--
-- ---------------------------------------------------------------------------
-- WHAT A ROW HERE MEANS
--
-- One contributor's private scratchpad: which steps of the fork →
-- branch → commit → pull request checklist they have ticked off for one
-- project or one tool. It is a UI convenience, nothing more.
--
-- It is NOT a record of work done. Ticking "open the pull request" is a
-- claim nobody verified — DevTunnel never observes it. So nothing here
-- feeds `admin_project_list.devtunnel_contributor_count`, the activity
-- log, or any contributor statistic, for the same reason sql/026's
-- membership rows don't: intent and delivered work are different facts,
-- and a metric built on self-reported ticks would be fiction (rule 38).
--
-- That is also why the steps are stored as opaque text, not as a foreign
-- key to a steps table. The checklist is frontend copy that will be
-- reworded; a stale id here simply doesn't match any rendered step and
-- is ignored, which is the correct failure mode for a scratchpad.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- contribution_progress — one row per (contributor, project|tool).
--
-- Two nullable owner columns with a check constraint, rather than either
-- of the two obvious alternatives:
--
--   * A polymorphic (entity_type, entity_id) pair — rejected for the same
--     reason sql/026 rejected it: it cannot carry a real foreign key to
--     either table, which is exactly the integrity wanted here.
--   * Two separate tables, as sql/026 used — rejected because, unlike a
--     membership, this row carries a payload (`completed_steps`) and a
--     mutation path. Two tables would mean two upserts, two indexes and
--     two validation sites for one behaviour, and the check constraint
--     below gives the same guarantee one table over (rule 51).
--
-- Exactly one of project_id / tool_id is set, enforced by
-- contribution_progress_one_owner. Both foreign keys cascade on delete,
-- so a removed project, tool or user leaves no orphaned scratchpad rows.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.contribution_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references devtunnel.users (id) on delete cascade,
  project_id       uuid references devtunnel.projects (id) on delete cascade,
  tool_id          uuid references devtunnel.opensource_tools (id) on delete cascade,

  -- Opaque step ids from the frontend checklist, e.g. {'fork','branch'}.
  -- Bounded by the route's own zod schema (32 ids, 64 chars each) so a
  -- client can't grow this array without limit (rule 67).
  completed_steps  text[] not null default '{}',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint contribution_progress_one_owner check (
    (project_id is not null and tool_id is null)
    or (project_id is null and tool_id is not null)
  )
);

-- Partial unique indexes rather than a composite primary key: a unique
-- constraint over nullable columns wouldn't collapse two rows that both
-- have a null on the other side, so "one row per contributor per project"
-- has to be stated per owner column. These are also what the routes'
-- upsert conflict targets resolve against, which is what makes saving
-- progress idempotent under a double-click or a retry (rule 55).
create unique index if not exists contribution_progress_user_project_uniq
  on devtunnel.contribution_progress (user_id, project_id)
  where project_id is not null;

create unique index if not exists contribution_progress_user_tool_uniq
  on devtunnel.contribution_progress (user_id, tool_id)
  where tool_id is not null;

-- ---------------------------------------------------------------------------
-- Access control — identical posture to every other table in this schema
-- (sql/001): the backend uses the service role key and bypasses RLS; RLS
-- is enabled with no policies as defence in depth, so anon/authenticated
-- get zero access even if the schema is accidentally exposed.
--
-- Worth stating plainly for this table: rows are private to one
-- contributor, and the only read path is the two GET /…/contribute routes,
-- which scope every query to the authenticated user's own id.
-- ---------------------------------------------------------------------------
alter table devtunnel.contribution_progress enable row level security;

revoke all on devtunnel.contribution_progress from anon, authenticated;