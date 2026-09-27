-- DevTunnel — AI-authored task titles.
--
-- 020_add_ai_discovery.sql / 021_add_ai_discovery_authored_fields.sql fixed
-- `custom_description` to use the Gemini/Groq-authored `task_summary`
-- instead of `ai_reasoning`, but `approve_ai_discovered_task` still set
-- `tasks.title := v_row.issue_title` — the raw GitHub issue title,
-- verbatim. Real issue titles are frequently vague, jargon-heavy, or just
-- a reference to another issue/PR number, so contributors saw a task
-- title that told them nothing about what to actually do.
--
-- This migration adds a real `task_title` column the discovery agent now
-- authors itself (see aiDiscoveryAgent.ts `runTaskDiscovery`'s prompt and
-- aiDiscoveryValidation.ts's `TaskCandidateInput`) — a short, clear,
-- meaningful title written for a contributor — and makes
-- `approve_ai_discovered_task` use IT as `tasks.title`, keeping
-- `issue_title` around purely as the original GitHub reference (still
-- shown inside `github_issue_snapshot`).
--
-- Existing PENDING rows discovered before this migration have no
-- `task_title` yet (default ''), so the function falls back to the raw
-- issue title for those specific rows only — never blocking or breaking
-- an admin's ability to approve something already sitting in the queue.
--
-- Run once, after 036_add_profile_activity_tracking.sql.

alter table devtunnel.ai_discovered_tasks
  add column if not exists task_title text not null default '';

create or replace function devtunnel.approve_ai_discovered_task(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, title text, project_slug text)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_row devtunnel.ai_discovered_tasks%rowtype;
  v_project_slug text;
  v_title text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
  v_task_id uuid;
  v_snapshot jsonb;
begin
  select * into v_row from devtunnel.ai_discovered_tasks where id = p_id for update;

  if not found then
    raise exception 'AI_TASK_NOT_FOUND';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'AI_TASK_ALREADY_REVIEWED';
  end if;

  select p.slug into v_project_slug from devtunnel.projects p where p.id = v_row.project_id;
  if v_project_slug is null then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if exists (
    select 1 from devtunnel.tasks
    where project_id = v_row.project_id and github_issue_number = v_row.issue_number
  ) then
    raise exception 'ISSUE_ALREADY_A_TASK';
  end if;

  -- Prefer the AI-authored, contributor-facing title; only a PENDING row
  -- discovered before this migration (task_title still '') falls back to
  -- the raw GitHub issue title.
  v_title := nullif(v_row.task_title, '');
  if v_title is null then
    v_title := v_row.issue_title;
  end if;

  v_base_slug := lower(regexp_replace(v_title, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'task';
  end if;
  v_slug := v_base_slug;

  while exists (
    select 1 from devtunnel.tasks where project_id = v_row.project_id and slug = v_slug
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  v_snapshot := jsonb_build_object(
    'number', v_row.issue_number,
    'title', v_row.issue_title,
    'state', 'OPEN',
    'url', v_row.issue_url,
    'labels', coalesce(v_row.issue_labels, '[]'::jsonb),
    'author', coalesce(v_row.github_author, 'null'::jsonb),
    'body', v_row.issue_body,
    'commentCount', 0,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.created_at
  );

  insert into devtunnel.tasks (
    project_id, title, status, created_by,
    slug, github_issue_number, github_issue_url, github_issue_snapshot,
    custom_description, roles, difficulty
  ) values (
    v_row.project_id, v_title, 'OPEN', p_admin_id,
    v_slug, v_row.issue_number, v_row.issue_url, v_snapshot,
    v_row.task_summary, coalesce(v_row.suggested_roles, '{}'), v_row.suggested_difficulty
  )
  returning devtunnel.tasks.id into v_task_id;

  update devtunnel.ai_discovered_tasks
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_task_id = v_task_id
  where devtunnel.ai_discovered_tasks.id = p_id;

  return query
    select t.id, t.slug, t.title, v_project_slug from devtunnel.tasks t where t.id = v_task_id;
end;
$$;