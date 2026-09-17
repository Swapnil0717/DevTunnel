-- DevTunnel — community submissions (projects and tools submitted by
-- contributors, not onboarded by an admin).
--
-- Adds:
--   1. devtunnel.user_submissions — the published community list behind
--      `/submissions` (GET /submissions, src/routes/submissions.ts).
--   2. devtunnel.user_submission_drafts — the 3-step submit wizard's
--      working state. A row here is NEVER a published submission; only
--      devtunnel.complete_user_submission() turns one into a
--      user_submissions row, and only once every step has genuinely
--      completed. Same posture as project_onboarding_drafts (sql/006)
--      and opensource_tool_onboarding_drafts (sql/017): the backend owns
--      "is this finished", never the frontend.
--   3. devtunnel.user_submission_upvotes — the signal the New / Trending
--      / Popular sorts are computed from.
--   4. devtunnel.user_submission_list — the read view those sorts and
--      filters query.
--
-- Run once, after 027_add_contribution_progress.sql.
--
-- ---------------------------------------------------------------------------
-- WHY ONE TABLE FOR PROJECTS AND TOOLS
--
-- sql/006 and sql/017 keep admin-onboarded projects and tools in separate
-- tables, and that's right for them: an onboarded project carries tasks,
-- a curated tech stack and a maintainer; an onboarded tool carries a
-- setup guide and labels. They diverge.
--
-- A community submission doesn't. Both kinds are the same six facts —
-- a URL, a name, a description, a README, a tech stack, who submitted it
-- — and the page lists them interleaved, sorted and filtered together.
-- Two tables would mean a UNION behind every sort and every filter, and
-- a second copy of the wizard to maintain. `kind` is the one column that
-- differs, so `kind` is a column (rule 51).
--
-- These rows are also deliberately NOT devtunnel.projects rows. An
-- onboarded project is something DevTunnel vouched for and curated tasks
-- against; a submission is something a contributor pointed at. Merging
-- them would silently promote unreviewed links into the curated catalog
-- and into every task-matching query that reads it (rule 38).
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- Project or tool. Separate from any admin enum: this is the submitter's
-- own claim about what they're sharing, not a curation decision.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_submission_kind') then
    create type devtunnel.user_submission_kind as enum ('PROJECT', 'TOOL');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- user_submissions — the published community list.
--
-- `devtunnel.onboarding_description_choice` (EXISTING/CUSTOM) is reused
-- from sql/006 rather than declaring a third identical enum — step 2 of
-- this wizard is the same two-choice shape as the other two flows: the
-- fetched description is never rewritten, a custom one is layered
-- alongside it.
--
-- `tech_stack` is a flat text[] rather than the bucketed jsonb
-- `projects.tech_stack` carries. The only thing this list does with a
-- tech stack is filter on it ("show me the Rust ones"), and a flat array
-- can carry a GIN index that answers that in one operator; the bucketed
-- shape would need unnesting per query for no gain here.
--
-- `is_paid_alternative` / `alternative_to` back the "Alternative to paid
-- software" filter. Two columns, not one: the boolean is what the filter
-- tests, and the array is what the card shows ("alternative to Figma").
-- Storing only the array and testing for non-empty would conflate "not
-- an alternative" with "an alternative, names not given yet".
--
-- `removed_at` is a moderation soft-delete, matching how devtunnel.projects
-- handles removal. Nothing in this migration writes it; it exists so a
-- future moderation action doesn't have to hard-delete a contributor's
-- submission along with its upvotes.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.user_submissions (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null,
  kind                    devtunnel.user_submission_kind not null,
  name                    text not null,

  source_url              text not null,
  /** owner/repo when the source is a GitHub repository, else null. */
  repository_full_name    text,

  fetched_description     text,
  custom_description      text,
  description_source      devtunnel.onboarding_description_choice not null default 'EXISTING',
  readme                  text,

  primary_language        text,
  tech_stack              text[] not null default '{}',

  is_paid_alternative     boolean not null default false,
  alternative_to          text[] not null default '{}',

  submitted_by            uuid not null references devtunnel.users (id) on delete cascade,

  created_at              timestamptz not null default now(),
  removed_at              timestamptz
);

create unique index if not exists user_submissions_slug_key
  on devtunnel.user_submissions (slug);

-- One submission per source URL: the same repository submitted twice is
-- the same submission, and the wizard's preview step checks this before
-- the contributor gets as far as confirming (rule 55). Partial on
-- removed_at so a moderated-away row doesn't permanently block a
-- resubmission.
create unique index if not exists user_submissions_source_url_key
  on devtunnel.user_submissions (lower(source_url))
  where removed_at is null;

-- The "New" sort, and the default read order.
create index if not exists user_submissions_created_at_idx
  on devtunnel.user_submissions (created_at desc)
  where removed_at is null;

-- The tech-stack filter — GIN so `tech_stack && array['Rust']` is an
-- index scan rather than a sequential one as the list grows.
create index if not exists user_submissions_tech_stack_idx
  on devtunnel.user_submissions using gin (tech_stack);

-- "Everything I've submitted" on a profile page.
create index if not exists user_submissions_submitted_by_idx
  on devtunnel.user_submissions (submitted_by);

-- ---------------------------------------------------------------------------
-- user_submission_upvotes — the one signal behind Trending and Popular.
--
-- Upvotes rather than reusing devtunnel.github_stars (sql/025): a star
-- there is a real star placed on the contributor's actual GitHub account
-- via the API, which requires a live GitHub token and changes something
-- outside DevTunnel. Making "I think this is worth a look" cost a write
-- to someone's GitHub profile would be the wrong trade for a browsing
-- list, and it would leave tools that aren't GitHub repositories with no
-- way to rank at all.
--
-- Composite primary key, so upvoting twice is idempotent and one
-- contributor can never inflate a count (rule 55).
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.user_submission_upvotes (
  submission_id  uuid not null references devtunnel.user_submissions (id) on delete cascade,
  user_id        uuid not null references devtunnel.users (id) on delete cascade,
  created_at     timestamptz not null default now(),

  primary key (submission_id, user_id)
);

-- Trending counts upvotes inside a time window, so that window's scans
-- lead with created_at.
create index if not exists user_submission_upvotes_created_at_idx
  on devtunnel.user_submission_upvotes (created_at desc);

create index if not exists user_submission_upvotes_user_id_idx
  on devtunnel.user_submission_upvotes (user_id);

-- ---------------------------------------------------------------------------
-- user_submission_list — what GET /submissions reads.
--
-- A view rather than counter columns on the table itself, same choice
-- sql/015's admin_project_list makes: a denormalised `upvote_count`
-- would need a trigger to stay true, and a counter that can drift from
-- the rows it claims to count is worse than a slightly more expensive
-- honest one (rule 38).
--
-- WHAT THE THREE SORTS MEAN, precisely, because "trending" is the kind
-- of word that quietly turns into a made-up number:
--   * new       — created_at desc. Nothing else.
--   * popular   — upvote_count desc. All-time, no decay.
--   * trending  — recent_upvote_count desc: upvotes received in the last
--                 7 days. A genuine count over a window, not a weighted
--                 score with invented coefficients. A submission from
--                 last year that five people found this week trends; one
--                 posted today with no upvotes does not.
-- Ties on any sort break by created_at desc, so the order is total and
-- pagination can't repeat or skip a row.
-- ---------------------------------------------------------------------------
create or replace view devtunnel.user_submission_list as
select
  s.id,
  s.slug,
  s.kind,
  s.name,
  s.source_url,
  s.repository_full_name,
  s.fetched_description,
  s.custom_description,
  s.description_source,
  s.primary_language,
  s.tech_stack,
  s.is_paid_alternative,
  s.alternative_to,
  s.submitted_by,
  coalesce(u.github_username, u.username) as submitted_by_username,
  u.name                                  as submitted_by_name,
  u.avatar_url                            as submitted_by_avatar_url,
  coalesce(u.github_profile_url, '')      as submitted_by_profile_url,
  s.created_at,
  coalesce(v.upvote_count, 0)        as upvote_count,
  coalesce(v.recent_upvote_count, 0) as recent_upvote_count
from devtunnel.user_submissions s
join devtunnel.users u
  on u.id = s.submitted_by
left join lateral (
  select
    count(*)                                                              as upvote_count,
    count(*) filter (where uv.created_at > now() - interval '7 days')      as recent_upvote_count
  from devtunnel.user_submission_upvotes uv
  where uv.submission_id = s.id
) v on true
where s.removed_at is null;

-- ---------------------------------------------------------------------------
-- user_submission_drafts — the 3-step wizard's working state.
--
-- Step 1 writes the source_* columns (fetched from GitHub, never typed).
-- Step 2 writes the description/tech-stack/alternative columns. Step 3
-- reads the row back for preview and calls complete_user_submission().
--
-- Drafts are per-contributor and are never listed publicly. An abandoned
-- draft is harmless: it holds a URL and a fetched description, and is
-- deleted with the user.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.user_submission_drafts (
  id                      uuid primary key default gen_random_uuid(),
  created_by              uuid not null references devtunnel.users (id) on delete cascade,

  kind                    devtunnel.user_submission_kind not null default 'PROJECT',

  -- Step 1 — fetched from the source, never hand-typed.
  source_url              text,
  source_name             text,
  repository_full_name    text,
  fetched_description     text,
  readme                  text,
  primary_language        text,
  detected_tech_stack     text[] not null default '{}',

  -- Step 2 — the contributor's own choices.
  description_source      devtunnel.onboarding_description_choice not null default 'EXISTING',
  custom_description      text,
  tech_stack              text[] not null default '{}',
  is_paid_alternative     boolean not null default false,
  alternative_to          text[] not null default '{}',

  -- Backend-owned completion flags. The wizard reads these; it never
  -- decides for itself that a step is done (sql/006's posture).
  source_completed        boolean not null default false,
  details_completed       boolean not null default false,

  completed_submission_id uuid references devtunnel.user_submissions (id) on delete set null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists user_submission_drafts_created_by_idx
  on devtunnel.user_submission_drafts (created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- complete_user_submission — the ONLY path that publishes a submission.
--
-- Atomic and row-locked, same shape as complete_project_onboarding
-- (sql/006) and complete_opensource_tool_onboarding (sql/017):
--   * locks the draft so two concurrent confirms can't both publish;
--   * re-checks every step server-side rather than trusting the caller;
--   * returns the already-published row if the draft was completed
--     before, so a retried confirm is idempotent rather than a duplicate;
--   * derives the slug here, so the frontend never invents an identifier.
--
-- p_user_id is checked against the draft's owner: a draft id is not a
-- capability, and one contributor must never be able to publish
-- another's draft by guessing a uuid (rule 30).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.complete_user_submission(
  p_draft_id uuid,
  p_user_id  uuid
)
returns devtunnel.user_submissions
language plpgsql
security definer
set search_path = devtunnel, public
as $$
declare
  d           devtunnel.user_submission_drafts;
  existing    devtunnel.user_submissions;
  created     devtunnel.user_submissions;
  base_slug   text;
  final_slug  text;
  suffix      int := 1;
begin
  select * into d
  from devtunnel.user_submission_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'draft_not_found' using errcode = 'P0002';
  end if;

  if d.created_by <> p_user_id then
    raise exception 'draft_not_owned' using errcode = 'P0001';
  end if;

  -- Already published — hand back the same row rather than making a
  -- second one (rule 55).
  if d.completed_submission_id is not null then
    select * into existing
    from devtunnel.user_submissions
    where id = d.completed_submission_id;
    return existing;
  end if;

  if not d.source_completed or d.source_url is null or d.source_name is null then
    raise exception 'source_incomplete' using errcode = 'P0001';
  end if;

  if not d.details_completed then
    raise exception 'details_incomplete' using errcode = 'P0001';
  end if;

  if d.description_source = 'CUSTOM'
     and (d.custom_description is null or length(trim(d.custom_description)) = 0) then
    raise exception 'custom_description_required' using errcode = 'P0001';
  end if;

  if array_length(d.tech_stack, 1) is null then
    raise exception 'tech_stack_required' using errcode = 'P0001';
  end if;

  if d.is_paid_alternative and array_length(d.alternative_to, 1) is null then
    raise exception 'alternative_to_required' using errcode = 'P0001';
  end if;

  -- Same URL already on the list — surfaced as a 409 by the route so the
  -- contributor is sent to the existing entry rather than told "error".
  if exists (
    select 1 from devtunnel.user_submissions
    where lower(source_url) = lower(d.source_url) and removed_at is null
  ) then
    raise exception 'already_submitted' using errcode = 'P0001';
  end if;

  base_slug := regexp_replace(lower(trim(d.source_name)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'submission'; end if;

  final_slug := base_slug;
  while exists (select 1 from devtunnel.user_submissions where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix;
  end loop;

  insert into devtunnel.user_submissions (
    slug, kind, name, source_url, repository_full_name,
    fetched_description, custom_description, description_source, readme,
    primary_language, tech_stack, is_paid_alternative, alternative_to,
    submitted_by
  )
  values (
    final_slug, d.kind, d.source_name, d.source_url, d.repository_full_name,
    d.fetched_description, d.custom_description, d.description_source, d.readme,
    d.primary_language, d.tech_stack, d.is_paid_alternative, d.alternative_to,
    p_user_id
  )
  returning * into created;

  update devtunnel.user_submission_drafts
  set completed_submission_id = created.id,
      updated_at = now()
  where id = d.id;

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access control — same posture as every table in this schema (sql/001):
-- the backend holds the service role key and authorizes in code; RLS is
-- on with no policies so anon/authenticated get nothing even if the
-- schema is exposed.
-- ---------------------------------------------------------------------------
alter table devtunnel.user_submissions enable row level security;
alter table devtunnel.user_submission_upvotes enable row level security;
alter table devtunnel.user_submission_drafts enable row level security;

revoke all on devtunnel.user_submissions from anon, authenticated;
revoke all on devtunnel.user_submission_upvotes from anon, authenticated;
revoke all on devtunnel.user_submission_drafts from anon, authenticated;
revoke all on devtunnel.user_submission_list from anon, authenticated;
revoke all on function devtunnel.complete_user_submission(uuid, uuid) from anon, authenticated;