-- DevTunnel — fix "column reference is ambiguous" in the three
-- approve_ai_discovered_* functions.
--
-- Each function is declared `returns table (id uuid, slug text, ...)`.
-- In PL/pgSQL, RETURNS TABLE output columns become variables visible
-- through the whole function body — so a bare `where id = p_id` is
-- genuinely ambiguous between the OUT parameter `id` and the table's
-- own `id` column, and Postgres refuses to guess (this is what actually
-- broke every approve click with a 500, surfaced as
-- "column reference \"id\" is ambiguous"). The same collision hits
-- `slug` in approve_ai_discovered_project/tool's dedup loops.
--
-- Fix: add the `#variable_conflict use_column` directive, which tells
-- PL/pgSQL to always prefer the table column over a same-named variable
-- for the rest of the function — exactly what every one of these bare
-- references already intended. No other logic changes from
-- 021_add_ai_discovery_authored_fields.sql.
--
-- Run once, after 021_add_ai_discovery_authored_fields.sql.

create or replace function devtunnel.approve_ai_discovered_project(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_row devtunnel.ai_discovered_projects%rowtype;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
  v_project_id uuid;
begin
  select * into v_row from devtunnel.ai_discovered_projects where id = p_id for update;

  if not found then
    raise exception 'AI_PROJECT_NOT_FOUND';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'AI_PROJECT_ALREADY_REVIEWED';
  end if;

  if exists (select 1 from devtunnel.projects where github_full_name = v_row.github_full_name) then
    raise exception 'REPOSITORY_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(v_row.github_repo_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'project';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from devtunnel.projects where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into devtunnel.projects (
    name, slug, description, repo_url, created_by,
    github_owner, github_repo_name, github_full_name, github_description,
    readme, primary_language, stars, forks, open_issues,
    description_source, custom_description, category, tech_stack, status
  ) values (
    v_row.github_repo_name, v_slug, v_row.description, v_row.repository_url, p_admin_id,
    v_row.github_owner, v_row.github_repo_name, v_row.github_full_name, v_row.github_description,
    v_row.readme, v_row.primary_language, v_row.stars, v_row.forks, v_row.open_issues,
    'CUSTOM', v_row.description, nullif(v_row.category, ''), coalesce(v_row.tech_stack, '{}'::jsonb), 'ACTIVE'
  )
  returning devtunnel.projects.id into v_project_id;

  update devtunnel.ai_discovered_projects
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_project_id = v_project_id
  where devtunnel.ai_discovered_projects.id = p_id;

  return query select p.id, p.slug, p.name from devtunnel.projects p where p.id = v_project_id;
end;
$$;

create or replace function devtunnel.approve_ai_discovered_tool(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_row devtunnel.ai_discovered_tools%rowtype;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
  v_tool_id uuid;
begin
  select * into v_row from devtunnel.ai_discovered_tools where id = p_id for update;

  if not found then
    raise exception 'AI_TOOL_NOT_FOUND';
  end if;

  if v_row.status <> 'PENDING' then
    raise exception 'AI_TOOL_ALREADY_REVIEWED';
  end if;

  if exists (select 1 from devtunnel.opensource_tools where source_url = v_row.source_url) then
    raise exception 'TOOL_ALREADY_ONBOARDED';
  end if;

  v_base_slug := lower(regexp_replace(v_row.name, '[^a-zA-Z0-9]+', '-', 'g'));
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
    slug, name, source_url, fetched_description, readme, primary_language,
    description_source, custom_description, labels, setup_guide, created_by
  ) values (
    v_slug, v_row.name, v_row.source_url, v_row.fetched_description, v_row.readme, v_row.primary_language,
    'CUSTOM', v_row.description, coalesce(v_row.labels, '[]'::jsonb), v_row.setup_guide, p_admin_id
  )
  returning devtunnel.opensource_tools.id into v_tool_id;

  update devtunnel.ai_discovered_tools
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_tool_id = v_tool_id
  where devtunnel.ai_discovered_tools.id = p_id;

  return query select t.id, t.slug, t.name from devtunnel.opensource_tools t where t.id = v_tool_id;
end;
$$;

create or replace function devtunnel.approve_ai_discovered_task(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, title text, project_slug text)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_row devtunnel.ai_discovered_tasks%rowtype;
  v_project_slug text;
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

  v_base_slug := lower(regexp_replace(v_row.issue_title, '[^a-zA-Z0-9]+', '-', 'g'));
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
    v_row.project_id, v_row.issue_title, 'OPEN', p_admin_id,
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