-- DevTunnel — Admin "Delete Project" support (soft delete)
--
-- admin_workflow.txt does not specify a DELETE route for
-- `/admin/projects/:id` (section 22 only lists GET/GET/PATCH), but
-- section 15 ("Deleted DevTunnel Tasks / Issues") is explicit that when a
-- DevTunnel record with real history (contributors, submissions, PRs) is
-- removed, DevTunnel should "prefer a soft-delete/archive record rather
-- than physically destroying the relationship if historical visibility is
-- required" (Backend_Development_Rules.txt rule 86 — "Use Soft Delete
-- Where Appropriate"). A project is exactly that kind of record:
-- `devtunnel.tasks` and `devtunnel.pull_requests` both reference
-- `projects.id` with `on delete cascade` (sql/004), so a hard `DELETE`
-- would silently destroy every task, submission, and PR ever recorded
-- against the project — the opposite of rule 85 ("Never Delete
-- Production Data Accidentally"). This migration adds the columns and a
-- single guarded RPC function needed for a safe, auditable soft delete.
--
-- Run once, after 007_add_admin_project_list.sql.
--
-- NOTE for whoever runs this next: this snapshot's sql/ folder does not
-- contain the `create view devtunnel.admin_project_list` statement that
-- src/db/adminProjects.ts and this file's own comments describe (only a
-- later `create or replace function` fix to it survived, in 007). Per
-- Backend_Development_Rules.txt rule 5 ("never invent schema beyond what's
-- actually being built/verified"), this migration does NOT guess at that
-- view's join/aggregation logic and does not touch it. Once you have the
-- real view definition, add `and p.deleted_at is null` (or an equivalent
-- predicate against `devtunnel.projects.deleted_at`) to its `from
-- devtunnel.projects p` clause so soft-deleted projects stop appearing in
-- `GET /admin/projects` / `GET /admin/projects/:id`. Until then, deleted
-- projects are correctly marked in the database and rejected by every
-- mutating endpoint, but may still be visible in that read view.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- devtunnel.projects — soft-delete columns
-- ---------------------------------------------------------------------------
alter table devtunnel.projects
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references devtunnel.users (id) on delete set null,
  add column if not exists delete_reason text;

-- Fast "active projects only" scans, same partial-index shape as
-- projects_status_idx (sql/006).
create index if not exists projects_deleted_at_idx
  on devtunnel.projects (deleted_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Free up a deleted project's repository for re-onboarding.
--
-- projects_github_full_name_key (sql/006) currently enforces "at most one
-- project per github_full_name, ever". After a soft delete, an admin may
-- legitimately want to re-import the same repository, so the constraint
-- is narrowed to "at most one *active* project per github_full_name" —
-- deleted rows are excluded, exactly like the deleted_at partial index
-- above.
-- ---------------------------------------------------------------------------
drop index if exists devtunnel.projects_github_full_name_key;

create unique index if not exists projects_github_full_name_key
  on devtunnel.projects (github_full_name)
  where github_full_name is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- complete_project_onboarding — re-declared verbatim from
-- sql/007_add_admin_project_list.sql, with one change: the
-- REPOSITORY_ALREADY_ONBOARDED guard now also excludes soft-deleted
-- projects, matching the partial unique index above. Postgres requires the
-- full function body on `create or replace function`; everything else is
-- unchanged from 007.
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
  -- violation 500. Soft-deleted projects no longer hold this repository.
  if exists (
    select 1 from devtunnel.projects p
    where p.github_full_name = v_draft.github_full_name
      and p.deleted_at is null
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

-- ---------------------------------------------------------------------------
-- delete_admin_project — the actual soft delete.
--
-- Backs `DELETE /admin/projects/:id`. Deliberately a single guarded
-- function rather than a bare `update ... set deleted_at = now()` inline
-- in application code (rule 85: destructive-adjacent operations must be
-- deliberate, not an easy one-line accident) — mirrors the shape of
-- `complete_project_onboarding` above: lock the row, check preconditions,
-- raise a specific exception per failure, mutate, return the result.
--
-- Never physically deletes the row. `devtunnel.tasks` and
-- `devtunnel.pull_requests` keep their `project_id` foreign key intact —
-- history stays queryable (section 15's "GitHub issue is not deleted just
-- because the DevTunnel representation is deleted" principle, applied one
-- level up: a project's tasks/PRs are not deleted just because the
-- project is).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.delete_admin_project(
  p_project_id uuid,
  p_admin_id   uuid,
  p_reason     text default null
)
returns table (id uuid, slug text, name text, deleted_at timestamptz)
language plpgsql
as $$
declare
  v_project devtunnel.projects%rowtype;
begin
  select * into v_project
  from devtunnel.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if v_project.deleted_at is not null then
    raise exception 'PROJECT_ALREADY_DELETED';
  end if;

  update devtunnel.projects p
  set deleted_at    = now(),
      deleted_by    = p_admin_id,
      delete_reason = p_reason
  where p.id = p_project_id;

  return query
    select p.id, p.slug, p.name, p.deleted_at
    from devtunnel.projects p
    where p.id = p_project_id;
end;
$$;