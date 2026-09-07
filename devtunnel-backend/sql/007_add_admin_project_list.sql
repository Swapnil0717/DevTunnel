-- DevTunnel — Fix ambiguous column references in complete_project_onboarding()
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
-- Two spots hit this in the original 006 definition:
--   1. `select * into v_draft from ... where id = p_draft_id`
--      (ambiguous: OUT var `id` vs. project_onboarding_drafts.id)
--   2. `while exists (select 1 from devtunnel.projects where slug = v_slug)`
--      (ambiguous: OUT var `slug` vs. projects.slug)
--
-- Fix: qualify every such reference with its table name/alias. Logic is
-- otherwise unchanged from 006.
--
-- Run once, after 006_add_project_onboarding.sql.
-- ---------------------------------------------------------------------------

create or replace function devtunnel.complete_project_onboarding(
  p_draft_id uuid,
  p_admin_id uuid
)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
declare
  v_draft   devtunnel.project_onboarding_drafts%rowtype;
  v_base_slug text;
  v_slug      text;
  v_suffix    integer := 1;
  v_project_id uuid;
begin
  select * into v_draft
  from devtunnel.project_onboarding_drafts pod
  where pod.id = p_draft_id
  for update;

  if not found then
    raise exception 'ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.admin_id <> p_admin_id then
    -- Reported identically to "not found" by the caller (never reveal
    -- that a draft exists for a different admin — rule 13).
    raise exception 'ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.completed_project_id is not null then
    raise exception 'ONBOARDING_ALREADY_COMPLETED';
  end if;

  if not (
    v_draft.repository_completed
    and v_draft.description_completed
    and v_draft.tech_stack_completed
    and v_draft.preview_completed
    and v_draft.validation_completed
    and v_draft.has_github_app_access
    and v_draft.github_full_name is not null
  ) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  -- Another draft may have raced this one to onboard the same repository
  -- between Step 1 and now; the partial unique index on
  -- projects.github_full_name is the real guard, but checking here first
  -- gives a clean, specific error instead of a generic constraint-
  -- violation 500.
  if exists (
    select 1 from devtunnel.projects p
    where p.github_full_name = v_draft.github_full_name
  ) then
    raise exception 'REPOSITORY_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(coalesce(v_draft.github_repo_name, 'project'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'project';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from devtunnel.projects p where p.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into devtunnel.projects (
    name,
    slug,
    description,
    repo_url,
    created_by,
    github_owner,
    github_repo_name,
    github_full_name,
    github_description,
    readme,
    default_branch,
    primary_language,
    stars,
    forks,
    open_issues,
    github_author,
    github_contributors,
    description_source,
    custom_description,
    tech_stack,
    status,
    onboarding_draft_id
  ) values (
    v_draft.github_repo_name,
    v_slug,
    case when v_draft.description_choice = 'CUSTOM' then v_draft.custom_description else v_draft.github_description end,
    v_draft.repository_url,
    p_admin_id,
    v_draft.github_owner,
    v_draft.github_repo_name,
    v_draft.github_full_name,
    v_draft.github_description,
    v_draft.readme,
    v_draft.default_branch,
    v_draft.primary_language,
    coalesce(v_draft.stars, 0),
    coalesce(v_draft.forks, 0),
    coalesce(v_draft.open_issues, 0),
    v_draft.github_author,
    v_draft.github_contributors,
    v_draft.description_choice,
    v_draft.custom_description,
    coalesce(v_draft.tech_stack, '{}'::jsonb),
    'ACTIVE',
    v_draft.id
  )
  returning devtunnel.projects.id into v_project_id;

  update devtunnel.project_onboarding_drafts pod
  set completed_project_id = v_project_id,
      completed_at = now()
  where pod.id = v_draft.id;

  return query
    select p.id, p.slug, p.name from devtunnel.projects p where p.id = v_project_id;
end;
$$;
