-- DevTunnel — Admin Task Onboarding, Step 6 ("Issue Preview"), Step 7
-- ("Final Validation"), and Section 12 ("Task Creation Algorithm") —
-- admin_workflow.txt section 10; section 25 ("Task Onboarding State").
--
-- Run once, after 011_add_task_onboarding_tech_stack_difficulty.sql.

-- ---------------------------------------------------------------------------
-- Step 6/7 — preview_completed / validation_completed
--
-- Same two trailing flags `devtunnel.project_onboarding_drafts` already
-- has (sql/006) — `preview_completed` is set the moment
-- `GET .../:id/preview` is called (mirrors `markPreviewCompleted`), and
-- `validation_completed` reflects the last `POST .../:id/validate`
-- result. Both are reset to `false` whenever any earlier step is edited
-- (issue re-selected, issue information changed, tech stack re-attached,
-- curation changed) — see the corresponding `UPDATE` statements this
-- migration doesn't touch (application-level, src/db/taskOnboarding.ts) —
-- so a stale preview/validation can never survive an upstream change,
-- same "don't let stale downstream state silently survive an upstream
-- change" rule already applied when the selected project or issue
-- changes.
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists preview_completed    boolean not null default false,
  add column if not exists validation_completed boolean not null default false;

-- ---------------------------------------------------------------------------
-- devtunnel.tasks — extended with exactly what Task Onboarding actually
-- produces (Backend_Development_Rules.txt rule 5). `devtunnel.tasks`
-- (sql/004) only ever had `title`/`status`/`assignee_id` before this —
-- everything below is new.
--
-- `slug` is unique *per project* (not globally, unlike
-- `devtunnel.projects.slug`) — two different projects legitimately
-- having an issue titled "Fix login bug" shouldn't collide.
--
-- `github_issue_number` / `github_issue_url` / `github_issue_snapshot`
-- keep the exact GitHub issue this task was created from queryable and
-- displayable without a live GitHub call — the same snapshot-at-
-- selection-time posture as `task_onboarding_drafts.github_issue`
-- (sql/010), copied over verbatim at completion time rather than
-- re-fetched.
--
-- `custom_description` is DevTunnel-only metadata layered on top of (never
-- a rewrite of) `github_issue_snapshot`'s own body — same "the custom
-- information belongs to DevTunnel" rule as sql/010 — and is `null`
-- whenever the admin chose to just use the existing GitHub issue
-- information as-is.
--
-- `role` / `difficulty` reuse the exact `devtunnel.developer_role` /
-- `devtunnel.experience_level` enum types already defined (sql/002) —
-- "Use the exact difficulty values already defined by the current
-- source/schema if they exist" — rather than the plain-text +
-- CHECK-constraint approximation `task_onboarding_drafts.curation_role`/
-- `curation_difficulty` used (sql/011 predates this migration and
-- couldn't reference these enum types without a data migration; a real
-- task recorded here can use the real enum from day one).
--
-- `onboarding_draft_id` mirrors `devtunnel.projects.onboarding_draft_id`
-- (sql/006) — traceability from a real task back to the draft that
-- produced it, `on delete set null` so deleting old completed drafts
-- (if that's ever done) never cascades into deleting real tasks.
-- ---------------------------------------------------------------------------
alter table devtunnel.tasks
  add column if not exists slug                  text,
  add column if not exists github_issue_number    integer,
  add column if not exists github_issue_url       text,
  add column if not exists github_issue_snapshot  jsonb,
  add column if not exists custom_description     text,
  add column if not exists role                   devtunnel.developer_role,
  add column if not exists difficulty             devtunnel.experience_level,
  add column if not exists onboarding_draft_id    uuid references devtunnel.task_onboarding_drafts (id) on delete set null;

create unique index if not exists tasks_project_id_slug_key
  on devtunnel.tasks (project_id, slug)
  where slug is not null;

-- ---------------------------------------------------------------------------
-- complete_task_onboarding — the only path that ever turns a draft into a
-- real task (section 12's "Task Creation Algorithm"). Mirrors
-- `complete_project_onboarding` (sql/006) exactly: one atomic
-- transaction, `select ... for update` row-locks the draft so a
-- concurrent double-submit can't create two tasks from the same draft,
-- and every step is re-validated from the draft's actual stored data —
-- never trusting `validation_completed` alone (rule 10: backend is the
-- final security boundary, applied to business-rule validation too).
--
-- Ownership (`admin_id = p_admin_id`) is re-checked here, not only in
-- application code (rule 13: prevent IDOR).
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
  from devtunnel.task_onboarding_drafts d
  where d.id = p_draft_id
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

  v_title := coalesce(v_draft.github_issue->>'title', 'Untitled task');

  v_base_slug := lower(regexp_replace(v_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'task';
  end if;
  v_slug := v_base_slug;

  while exists (
    select 1 from devtunnel.tasks t
    where t.project_id = v_draft.project_id and t.slug = v_slug
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