-- DevTunnel — Admin Open Source Tool Onboarding
--
-- Adds:
--   1. devtunnel.opensource_tools — the published catalog table
--      (`/admin/opensource-tools/new`'s end result — "Add Open Source
--      Tool" in admin-nav-items.ts).
--   2. devtunnel.opensource_tool_onboarding_drafts — the 5-step wizard's
--      working state ("Onboarding Draft, not the final tool"). A row
--      here NEVER represents a published tool — only
--      `complete_opensource_tool_onboarding()` below ever turns one into
--      a row in `devtunnel.opensource_tools`, and only once every
--      mandatory step has genuinely completed. Same posture as
--      `project_onboarding_drafts` / `complete_project_onboarding`
--      (sql/006) — "do not let the frontend determine whether onboarding
--      is complete, the backend maintains that state."
--   3. devtunnel.complete_opensource_tool_onboarding() — an atomic,
--      row-locked Postgres function, the only path that ever produces a
--      catalog row.
--
-- Run once, after 016_add_task_duplicate_issue_validation.sql.
--
-- There's no admin_workflow.txt section for this flow — it isn't part of
-- the documented Admin Portal spec. Shape/naming instead follows the
-- already-implemented frontend contract in devtunnel-frontend/src/lib/
-- admin/opensource-tool-onboarding/{types.ts,api.ts}, the same
-- "frontend-as-source-of-truth" approach that file's own header
-- documents. Per Backend_Development_Rules.md rule 5, this migration
-- only adds the schema this one feature needs.
--
-- ---------------------------------------------------------------------------
-- Ordering note (fixes the first attempt at this migration):
-- `opensource_tool_onboarding_drafts.completed_tool_id` points at
-- `opensource_tools.id`, and `opensource_tools.onboarding_draft_id`
-- points back at the draft — a genuine circular reference. Postgres
-- can't resolve a foreign key to a table that doesn't exist yet, so
-- `opensource_tools` is created FIRST (without `onboarding_draft_id`),
-- then `opensource_tool_onboarding_drafts` (which can now reference
-- `opensource_tools.id`), then `onboarding_draft_id` is added back onto
-- `opensource_tools` with a trailing `ALTER TABLE`. This is the same
-- resolution `project_onboarding_drafts` / `projects` doesn't need to
-- do, since `projects` already existed as of sql/006 (it only gained
-- `onboarding_draft_id` as a new column, not a new table) — every column
-- on a brand-new pair of tables that reference each other has to be
-- split across statements like this at least once.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- devtunnel.opensource_tools — the published catalog table.
-- `devtunnel.onboarding_description_choice` (EXISTING/CUSTOM) is reused
-- as-is from sql/006 rather than declaring a second, identical enum —
-- it's the exact same two-choice shape Step 2 of this wizard needs.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.opensource_tools (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  name                  text not null,

  source_url            text not null,
  fetched_description   text,
  readme                text,
  primary_language      text,

  description_source    devtunnel.onboarding_description_choice not null,
  custom_description    text,

  -- Step 3 — Labels. Stored as the flat jsonb string array the frontend
  -- sends (`OnboardingToolLabels.values`), not a fixed enum — the set of
  -- relevant roles/fields isn't closed (see
  -- opensource-tool-onboarding/types.ts's own comment on this field).
  labels                jsonb not null default '[]'::jsonb,

  -- Step 4 — Setup & Usage. Admin-authored Markdown, never derived from
  -- `readme` (see that field's comment in the frontend types file).
  setup_guide           text not null default '',

  created_by            uuid not null references devtunnel.users (id) on delete restrict,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists opensource_tools_slug_key
  on devtunnel.opensource_tools (slug);

-- Stops the same tool URL from being onboarded twice — the catalog
-- equivalent of `projects_github_full_name_key` (sql/006).
create unique index if not exists opensource_tools_source_url_key
  on devtunnel.opensource_tools (source_url);

drop trigger if exists opensource_tools_set_updated_at on devtunnel.opensource_tools;
create trigger opensource_tools_set_updated_at
  before update on devtunnel.opensource_tools
  for each row execute function devtunnel.set_updated_at();

alter table devtunnel.opensource_tools enable row level security;
revoke all on devtunnel.opensource_tools from anon, authenticated;

-- ---------------------------------------------------------------------------
-- opensource_tool_onboarding_drafts
--
-- One row per in-progress (or completed) onboarding wizard run. `admin_id`
-- scopes every draft to the admin who started it — src/db/
-- opensourceToolOnboarding.ts always filters by both `id` and `admin_id`
-- so one admin can never read or mutate another admin's draft
-- (Backend_Development_Rules.md rule 13: prevent IDOR by verifying
-- ownership, not just resource existence).
--
-- `source_*` columns are populated exclusively by Step 1
-- (POST .../onboarding/url) from whatever the backend can resolve from
-- the given URL — never client-typed, mirroring `OnboardingToolSource`'s
-- own comment in the frontend types file ("no field here has a writable
-- counterpart the Admin fills in by hand").
--
-- The five `*_completed` booleans plus `validation_completed` are this
-- flow's authoritative onboarding state, only ever flipped by the
-- backend. Note `validation_completed` deliberately has no counterpart
-- in the frontend's `ToolOnboardingStepState` (types.ts) — it's an
-- internal gate for `/complete`, same role `validation_completed` plays
-- in `project_onboarding_drafts`, just not one of the five steps this
-- particular wizard surfaces back to the Admin.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.opensource_tool_onboarding_drafts (
  id                      uuid primary key default gen_random_uuid(),
  admin_id                uuid not null references devtunnel.users (id) on delete cascade,

  -- Step 1 — Tool URL
  source_url              text,
  source_name             text,
  source_fetched_description text,
  source_readme            text,
  source_primary_language  text,
  url_completed            boolean not null default false,

  -- Step 2 — Description
  description_choice      devtunnel.onboarding_description_choice,
  custom_description      text,
  description_completed   boolean not null default false,

  -- Step 3 — Labels
  labels                   jsonb not null default '[]'::jsonb,
  labels_completed         boolean not null default false,

  -- Step 4 — Setup & Usage
  setup_guide_content      text not null default '',
  setup_guide_completed    boolean not null default false,

  -- Step 5 — Preview (a checkpoint, not new data of its own)
  preview_completed        boolean not null default false,

  -- Final validation gate (see comment above) — set by
  -- POST .../:id/validate, re-checked by /complete.
  validation_completed     boolean not null default false,

  -- Set only by complete_opensource_tool_onboarding(); a non-null value
  -- means this draft has already produced a published tool and must
  -- never be re-completed or re-imported over (rule 55: idempotent
  -- creation).
  completed_tool_id       uuid references devtunnel.opensource_tools (id) on delete set null,
  completed_at             timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists opensource_tool_onboarding_drafts_admin_id_idx
  on devtunnel.opensource_tool_onboarding_drafts (admin_id);

drop trigger if exists opensource_tool_onboarding_drafts_set_updated_at on devtunnel.opensource_tool_onboarding_drafts;
create trigger opensource_tool_onboarding_drafts_set_updated_at
  before update on devtunnel.opensource_tool_onboarding_drafts
  for each row execute function devtunnel.set_updated_at();

alter table devtunnel.opensource_tool_onboarding_drafts enable row level security;
revoke all on devtunnel.opensource_tool_onboarding_drafts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Add the reverse-pointing column now that both tables exist (see the
-- ordering note at the top of this file).
-- ---------------------------------------------------------------------------
alter table devtunnel.opensource_tools
  add column if not exists onboarding_draft_id uuid references devtunnel.opensource_tool_onboarding_drafts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- complete_opensource_tool_onboarding — the only path that ever turns a
-- draft into a real, published catalog tool. Runs as a single atomic
-- transaction so a concurrent request (double-click on "Create Tool", a
-- retried network request) can never publish two tools from the same
-- draft or leave a half-created row behind (Backend_Development_Rules.md
-- rule 26: use transactions; rule 55: make creation idempotent; rule 74:
-- handle race conditions). Same pattern as complete_project_onboarding
-- (sql/006).
--
-- `select ... for update` row-locks the draft for the duration of the
-- transaction, so a second concurrent call blocks until the first
-- commits — at which point `completed_tool_id is not null` and it
-- cleanly raises TOOL_ONBOARDING_ALREADY_COMPLETED instead of publishing
-- a duplicate.
--
-- Re-validates every step server-side from the draft's actual stored
-- data (never trusts that `validation_completed` alone is still
-- accurate) — the same "backend is the final security boundary" posture
-- as every other check in this codebase (rule 10).
--
-- Ownership (`admin_id = p_admin_id`) is checked here too, not only in
-- application code (rule 13: prevent IDOR).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.complete_opensource_tool_onboarding(
  p_draft_id uuid,
  p_admin_id uuid
)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
declare
  v_draft      devtunnel.opensource_tool_onboarding_drafts%rowtype;
  v_base_slug  text;
  v_slug       text;
  v_suffix     integer := 1;
  v_tool_id    uuid;
begin
  select * into v_draft
  from devtunnel.opensource_tool_onboarding_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'TOOL_ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.admin_id <> p_admin_id then
    -- Reported identically to "not found" by the caller (never reveal
    -- that a draft exists for a different admin — rule 13).
    raise exception 'TOOL_ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.completed_tool_id is not null then
    raise exception 'TOOL_ONBOARDING_ALREADY_COMPLETED';
  end if;

  if not (
    v_draft.url_completed
    and v_draft.description_completed
    and v_draft.labels_completed
    and v_draft.setup_guide_completed
    and v_draft.preview_completed
    and v_draft.validation_completed
    and v_draft.source_url is not null
    and v_draft.source_name is not null
  ) then
    raise exception 'TOOL_ONBOARDING_INCOMPLETE';
  end if;

  -- Another draft may have raced this one to onboard the same URL
  -- between Step 1 and now; the unique index on
  -- opensource_tools.source_url is the real guard, but checking here
  -- first gives a clean, specific error instead of a generic
  -- constraint-violation 500 (same reasoning as
  -- isRepositoryAlreadyOnboarded in db/projectOnboarding.ts).
  if exists (
    select 1 from devtunnel.opensource_tools
    where source_url = v_draft.source_url
  ) then
    raise exception 'TOOL_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(coalesce(v_draft.source_name, 'tool'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'tool';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from devtunnel.opensource_tools where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into devtunnel.opensource_tools (
    slug,
    name,
    source_url,
    fetched_description,
    readme,
    primary_language,
    description_source,
    custom_description,
    labels,
    setup_guide,
    created_by,
    onboarding_draft_id
  ) values (
    v_slug,
    v_draft.source_name,
    v_draft.source_url,
    v_draft.source_fetched_description,
    v_draft.source_readme,
    v_draft.source_primary_language,
    v_draft.description_choice,
    v_draft.custom_description,
    v_draft.labels,
    v_draft.setup_guide_content,
    p_admin_id,
    v_draft.id
  )
  returning devtunnel.opensource_tools.id into v_tool_id;

  update devtunnel.opensource_tool_onboarding_drafts
  set completed_tool_id = v_tool_id,
      completed_at = now()
  where devtunnel.opensource_tool_onboarding_drafts.id = v_draft.id;

  return query
    select t.id, t.slug, t.name from devtunnel.opensource_tools t where t.id = v_tool_id;
end;
$$;