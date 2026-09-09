-- DevTunnel — Duplicate-task validation for Task Onboarding
-- (admin_workflow.txt section 10 / section 12's "Task Creation Algorithm").
--
-- Mirrors what sql/006 + sql/008 already do for Project Onboarding:
-- `projects_github_full_name_key` stops the same GitHub repository from
-- becoming two DevTunnel projects, and `complete_project_onboarding`
-- raises a clean `REPOSITORY_ALREADY_ONBOARDED` instead of a generic
-- constraint-violation 500. Task Onboarding had no equivalent guard —
-- two separate task-onboarding drafts (the same admin re-running the
-- wizard, or two different admins) could each turn the same GitHub issue,
-- on the same project, into its own `devtunnel.tasks` row, with nothing
-- to stop it. This migration closes that gap the same way.
--
-- Run once, after 015_fix_admin_project_list_task_count.sql.
--
-- Per Backend_Development_Rules.txt rule 5, this migration only adds what
-- this one gap needs — no unrelated schema changes.

-- ---------------------------------------------------------------------------
-- At most one *active* task per (project, GitHub issue) — soft-deleted
-- tasks (`deleted_at`, sql/013) are excluded, exactly like
-- `projects_github_full_name_key` (sql/008) excludes soft-deleted
-- projects, so a deleted task legitimately frees its issue up for
-- re-onboarding.
-- ---------------------------------------------------------------------------
create unique index if not exists tasks_project_id_github_issue_number_key
  on devtunnel.tasks (project_id, github_issue_number)
  where github_issue_number is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- complete_task_onboarding — re-declared verbatim from sql/012, with one
-- addition: before inserting, check whether this project already has an
-- active task for this GitHub issue number and raise a specific
-- `ISSUE_ALREADY_ONBOARDED` exception instead of a generic
-- constraint-violation 500 if so (rule 20: centralized, predictable error
-- handling — same pattern as `complete_project_onboarding`'s
-- `REPOSITORY_ALREADY_ONBOARDED` check). The unique index above is the
-- real guard for the race-condition case (two concurrent completions of
-- different drafts targeting the same issue); this check just gives the
-- common case a clean, mapped error. Postgres requires the full function
-- body on `create or replace function`; everything else is unchanged from
-- sql/012.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.complete_task_onboarding(
  p_draft_id uuid,
  p_admin_id uuid
)
returns table (id uuid, slug text, title text, project_slug text)
language plpgsql
as $$
declare
  v_draft       devtunnel.task_onboarding_drafts%rowtype;
  v_project_slug text;
  v_title        text;
  v_base_slug    text;
  v_slug         text;
  v_suffix       integer := 1;
  v_task_id      uuid;
begin
  select * into v_draft
  from devtunnel.task_onboarding_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'TASK_ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.admin_id <> p_admin_id then
    -- Reported identically to "not found" by the caller (rule 13 — never
    -- reveal that a draft exists for a different admin).
    raise exception 'TASK_ONBOARDING_NOT_FOUND';
  end if;

  if v_draft.completed_task_id is not null then
    raise exception 'TASK_ONBOARDING_ALREADY_COMPLETED';
  end if;

  if not (
    v_draft.project_selected
    and v_draft.issue_selected
    and v_draft.issue_information_completed
    and v_draft.tech_stack_loaded
    and v_draft.difficulty_defined
    and v_draft.preview_completed
    and v_draft.validation_completed
    and v_draft.github_issue is not null
  ) then
    raise exception 'TASK_ONBOARDING_INCOMPLETE';
  end if;

  select p.slug into v_project_slug
  from devtunnel.projects p
  where p.id = v_draft.project_id
    and p.deleted_at is null;

  if v_project_slug is null then
    -- The project was deleted after Step 1 but before completion — a
    -- narrow but real race, reported distinctly rather than as a generic
    -- 500 (rule 20).
    raise exception 'TASK_ONBOARDING_PROJECT_UNAVAILABLE';
  end if;

  -- Another draft (this admin re-running the wizard, or a different
  -- admin entirely) may have already turned this same project + GitHub
  -- issue into a task — between Step 2 (issue selection) and now. The
  -- partial unique index above is the real guard against the race; this
  -- gives a clean, specific error instead of a generic
  -- constraint-violation 500 in the common (non-racing) case.
  if exists (
    select 1 from devtunnel.tasks t
    where t.project_id = v_draft.project_id
      and t.github_issue_number = v_draft.issue_number
      and t.deleted_at is null
  ) then
    raise exception 'ISSUE_ALREADY_ONBOARDED';
  end if;

  v_title := coalesce(v_draft.github_issue->>'title', 'Untitled task');

  v_base_slug := lower(regexp_replace(v_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'task';
  end if;
  v_slug := v_base_slug;

  while exists (
    select 1 from devtunnel.tasks
    where project_id = v_draft.project_id and slug = v_slug
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into devtunnel.tasks (
    project_id,
    title,
    status,
    created_by,
    slug,
    github_issue_number,
    github_issue_url,
    github_issue_snapshot,
    custom_description,
    role,
    difficulty,
    onboarding_draft_id
  ) values (
    v_draft.project_id,
    v_title,
    'OPEN',
    p_admin_id,
    v_slug,
    v_draft.issue_number,
    v_draft.github_issue->>'url',
    v_draft.github_issue,
    case when v_draft.issue_information_choice = 'CUSTOM' then v_draft.custom_description else null end,
    v_draft.curation_role::devtunnel.developer_role,
    v_draft.curation_difficulty::devtunnel.experience_level,
    v_draft.id
  )
  returning devtunnel.tasks.id into v_task_id;

  update devtunnel.task_onboarding_drafts
  set completed_task_id = v_task_id,
      completed_at = now()
  where devtunnel.task_onboarding_drafts.id = v_draft.id;

  return query
    select t.id, t.slug, t.title, v_project_slug from devtunnel.tasks t where t.id = v_task_id;
end;
$$;