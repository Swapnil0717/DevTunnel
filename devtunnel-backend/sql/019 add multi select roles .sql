-- DevTunnel — Multi-select roles/labels.
--
-- Three single-value "role" fields become multi-select array columns,
-- matching the frontend's move from a single-select `OptionCard`
-- (role="radio") to a multi-select one (role="checkbox"):
--
--   1. devtunnel.users.developer_role       -> developer_roles[]   (sql/002)
--   2. devtunnel.task_onboarding_drafts.curation_role -> curation_roles[] (sql/011)
--   3. devtunnel.tasks.role                 -> roles[]             (sql/012)
--
-- Each column keeps its old enum/constraint semantics, just pluralized
-- into an array — never a fabricated new taxonomy (Backend_Development_
-- Rules.txt rule 5). Existing single values are backfilled into a
-- one-element array so no data is lost; the old column is dropped only
-- after every dependent view/function/application query has been moved
-- over to the new column in this same migration.
--
-- Run once, after 018_fix_opensource_tool_onboarding_ambiguous_column.sql.

-- ---------------------------------------------------------------------------
-- 1) devtunnel.users.developer_role -> developer_roles
--    (PATCH /auth/onboarding, src/db/users.ts)
-- ---------------------------------------------------------------------------
alter table devtunnel.users
  add column if not exists developer_roles devtunnel.developer_role[] not null default '{}';

update devtunnel.users
set developer_roles = array[developer_role]
where developer_role is not null
  and developer_roles = '{}';

alter table devtunnel.users
  drop column if exists developer_role;

-- ---------------------------------------------------------------------------
-- 2) devtunnel.task_onboarding_drafts.curation_role -> curation_roles
--    (Task Onboarding Step 5, src/db/taskOnboarding.ts)
--
-- Kept as `text[]` with a containment check, same posture the original
-- `curation_role text` column took (sql/011's header: it predates the
-- `devtunnel.developer_role` enum being usable here without a data
-- migration — this migration doesn't change that reasoning, just makes
-- the plain-text column plural).
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists curation_roles text[];

update devtunnel.task_onboarding_drafts
set curation_roles = array[curation_role]
where curation_role is not null
  and curation_roles is null;

alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_curation_role_check;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_curation_roles_check
  check (
    curation_roles is null
    or curation_roles <@ array['FRONTEND', 'BACKEND', 'FULL_STACK', 'DOCUMENTATION', 'TESTING', 'DEVOPS']::text[]
  );

-- Both curation fields are set together or not at all — same rule as
-- before, just checking array-non-empty instead of not-null.
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_difficulty_consistent;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_difficulty_consistent
  check (
    (difficulty_defined = false and curation_roles is null and curation_difficulty is null)
    or
    (difficulty_defined = true and coalesce(array_length(curation_roles, 1), 0) > 0 and curation_difficulty is not null)
  );

alter table devtunnel.task_onboarding_drafts
  drop column if exists curation_role;

-- ---------------------------------------------------------------------------
-- 3) devtunnel.tasks.role -> roles
--    (Task Onboarding completion + PATCH /admin/tasks/:id)
--
-- `devtunnel.admin_task_list` (sql/013) and `complete_task_onboarding()`
-- (sql/012) both reference the old `role` column, so they're recreated
-- below, against the new `roles` column, before that column is dropped.
-- ---------------------------------------------------------------------------
alter table devtunnel.tasks
  add column if not exists roles devtunnel.developer_role[] not null default '{}';

update devtunnel.tasks
set roles = array[role]
where role is not null
  and roles = '{}';

-- ---------------------------------------------------------------------------
-- devtunnel.admin_task_list — recreated to surface `roles` instead of the
-- old singular `role` column (see sql/013 for the view's full original
-- header/rationale, unchanged here beyond this one column).
-- ---------------------------------------------------------------------------
create or replace view devtunnel.admin_task_list as
select
  t.id                     as id,
  t.slug                   as slug,
  t.title                  as title,
  t.status                 as status,
  t.roles                  as roles,
  t.difficulty             as difficulty,
  t.assignee_id            as assignee_id,
  t.github_issue_number    as github_issue_number,
  t.github_issue_url       as github_issue_url,
  t.github_issue_snapshot  as github_issue_snapshot,
  t.custom_description     as custom_description,
  t.deleted_at             as deleted_at,
  t.created_at             as created_at,
  p.id                     as project_id,
  p.slug                   as project_slug,
  p.name                   as project_name,
  p.repo_url               as project_repo_url,
  p.github_full_name       as project_github_full_name,
  p.github_author          as project_github_author,
  p.github_owner           as project_github_owner,
  p.tech_stack             as project_tech_stack,
  coalesce(pr.submission_count, 0) as submission_count
from devtunnel.tasks t
join devtunnel.projects p on p.id = t.project_id
left join (
  select pull.task_id, count(*) as submission_count
  from devtunnel.pull_requests pull
  where pull.task_id is not null
  group by pull.task_id
) pr on pr.task_id = t.id;

-- ---------------------------------------------------------------------------
-- complete_task_onboarding — recreated to read `curation_roles` (plural)
-- off the draft and write `roles` (plural) onto the new task, in place of
-- the old singular `curation_role` / `role` columns. Every other line is
-- identical to sql/012's original function body.
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
    and coalesce(array_length(v_draft.curation_roles, 1), 0) > 0
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
    roles,
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
    (select array_agg(value::devtunnel.developer_role) from unnest(v_draft.curation_roles) as value),
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

-- Now safe to drop the old singular column — the view and function above
-- no longer reference it.
alter table devtunnel.tasks
  drop column if exists role;