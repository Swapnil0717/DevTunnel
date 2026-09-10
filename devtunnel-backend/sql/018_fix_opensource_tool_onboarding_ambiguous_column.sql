-- DevTunnel — Fix ambiguous column references in
-- complete_opensource_tool_onboarding()
--
-- Bug: `returns table (id uuid, slug text, name text)` implicitly declares
-- `id`, `slug`, and `name` as PL/pgSQL variables scoped to the ENTIRE
-- function body — not just the final `return query`. Any bare,
-- unqualified reference to a column named `id` or `slug` elsewhere in the
-- function is therefore ambiguous between "the OUT variable" and "the
-- table column", which Postgres rejects at call time with:
--
--   column reference "id" is ambiguous
--
-- This is the exact same bug sql/007 fixed for complete_project_onboarding
-- (006) — 017 reintroduced it in the opensource-tool equivalent. Two spots
-- hit this in the original 017 definition:
--   1. `select * into v_draft from ... where id = p_draft_id`
--      (ambiguous: OUT var `id` vs. opensource_tool_onboarding_drafts.id)
--   2. `while exists (select 1 from devtunnel.opensource_tools where slug = v_slug)`
--      (ambiguous: OUT var `slug` vs. opensource_tools.slug)
--
-- Fix: qualify every such reference with its table alias. Logic is
-- otherwise unchanged from 017.
--
-- Run once, after 017 add opensource tool onboarding.sql.
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
  from devtunnel.opensource_tool_onboarding_drafts d
  where d.id = p_draft_id
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
    select 1 from devtunnel.opensource_tools t
    where t.source_url = v_draft.source_url
  ) then
    raise exception 'TOOL_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(coalesce(v_draft.source_name, 'tool'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'tool';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from devtunnel.opensource_tools t where t.slug = v_slug) loop
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