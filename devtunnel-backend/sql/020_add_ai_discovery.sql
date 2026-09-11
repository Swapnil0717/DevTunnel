-- DevTunnel — AI Discovery (Gemini-driven GitHub search agent).
--
-- Adds candidate tables for AI-proposed projects/tools/tasks, a daily
-- counter table enforcing the 24h discovery quotas, and Postgres
-- functions that atomically promote an approved candidate into the real
-- devtunnel.projects / devtunnel.opensource_tools / devtunnel.tasks
-- tables — mirroring complete_project_onboarding (sql/006) and
-- complete_opensource_tool_onboarding (sql/017) exactly, just sourcing
-- from an AI-authored candidate row instead of an admin-filled draft.
--
-- Run once, after 019_add_multi_select_roles_.sql.

create schema if not exists devtunnel;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ai_discovery_status' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.ai_discovery_status as enum ('PENDING', 'APPROVED', 'REJECTED');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'ai_discovery_difficulty' and typnamespace = 'devtunnel'::regnamespace
  ) then
    create type devtunnel.ai_discovery_difficulty as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Daily counters — one row per UTC date. This is the source of truth for
-- the "7 projects (3/3/1), 7 tools (1 per category)" 24h quota. The agent
-- reads this before searching and stops issuing more Gemini/GitHub calls
-- once each bucket is full, and every insert into the candidate tables
-- below bumps it atomically via bump_ai_discovery_counters().
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.ai_discovery_daily_counters (
  discovery_date          date primary key,
  projects_beginner       integer not null default 0,
  projects_intermediate   integer not null default 0,
  projects_advanced       integer not null default 0,
  tools_found             integer not null default 0,
  tool_categories_found   jsonb not null default '[]'::jsonb,
  tasks_found             integer not null default 0,
  updated_at              timestamptz not null default now()
);

alter table devtunnel.ai_discovery_daily_counters enable row level security;
revoke all on devtunnel.ai_discovery_daily_counters from anon, authenticated;

create or replace function devtunnel.bump_ai_discovery_counters(
  p_date date,
  p_projects_beginner integer default 0,
  p_projects_intermediate integer default 0,
  p_projects_advanced integer default 0,
  p_tools integer default 0,
  p_tool_category text default null,
  p_tasks integer default 0
)
returns devtunnel.ai_discovery_daily_counters
language plpgsql
as $$
declare
  v_row devtunnel.ai_discovery_daily_counters%rowtype;
begin
  insert into devtunnel.ai_discovery_daily_counters (discovery_date)
  values (p_date)
  on conflict (discovery_date) do nothing;

  update devtunnel.ai_discovery_daily_counters
  set
    projects_beginner = projects_beginner + p_projects_beginner,
    projects_intermediate = projects_intermediate + p_projects_intermediate,
    projects_advanced = projects_advanced + p_projects_advanced,
    tools_found = tools_found + p_tools,
    tool_categories_found = case
      when p_tool_category is not null and not (tool_categories_found ? p_tool_category)
        then tool_categories_found || to_jsonb(p_tool_category)
      else tool_categories_found
    end,
    tasks_found = tasks_found + p_tasks,
    updated_at = now()
  where discovery_date = p_date
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_discovered_projects
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.ai_discovered_projects (
  id                  uuid primary key default gen_random_uuid(),
  discovery_date      date not null,

  repository_url      text not null,
  github_owner        text not null,
  github_repo_name    text not null,
  github_full_name    text not null,
  github_description  text,
  readme              text,
  primary_language    text,
  stars               integer not null default 0,
  forks               integer not null default 0,
  open_issues         integer not null default 0,
  tech_stack          jsonb not null default '{}'::jsonb,

  difficulty          devtunnel.ai_discovery_difficulty not null,
  ai_reasoning        text not null,

  status              devtunnel.ai_discovery_status not null default 'PENDING',
  reviewed_by         uuid references devtunnel.users (id) on delete set null,
  reviewed_at         timestamptz,
  completed_project_id uuid references devtunnel.projects (id) on delete set null,

  created_at          timestamptz not null default now()
);

create unique index if not exists ai_discovered_projects_full_name_active_key
  on devtunnel.ai_discovered_projects (github_full_name)
  where status in ('PENDING', 'APPROVED');

create index if not exists ai_discovered_projects_status_idx
  on devtunnel.ai_discovered_projects (status, created_at desc);

alter table devtunnel.ai_discovered_projects enable row level security;
revoke all on devtunnel.ai_discovered_projects from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_discovered_tools
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.ai_discovered_tools (
  id                  uuid primary key default gen_random_uuid(),
  discovery_date      date not null,

  source_url          text not null,
  name                text not null,
  fetched_description text,
  readme              text,
  primary_language    text,
  category            text not null,
  labels              jsonb not null default '[]'::jsonb,

  ai_reasoning        text not null,

  status              devtunnel.ai_discovery_status not null default 'PENDING',
  reviewed_by         uuid references devtunnel.users (id) on delete set null,
  reviewed_at         timestamptz,
  completed_tool_id   uuid references devtunnel.opensource_tools (id) on delete set null,

  created_at          timestamptz not null default now()
);

create unique index if not exists ai_discovered_tools_source_url_active_key
  on devtunnel.ai_discovered_tools (source_url)
  where status in ('PENDING', 'APPROVED');

create index if not exists ai_discovered_tools_status_idx
  on devtunnel.ai_discovered_tools (status, created_at desc);

alter table devtunnel.ai_discovered_tools enable row level security;
revoke all on devtunnel.ai_discovered_tools from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_discovered_tasks — issues found on projects DevTunnel already
-- onboarded. Not subject to the 7/7 numeric quota (the spec asks the
-- agent to "address all the issues that are related to projects that
-- are in devtunnel"), but still deduplicated against real tasks and
-- previously-proposed candidates via the partial unique index below.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.ai_discovered_tasks (
  id                    uuid primary key default gen_random_uuid(),
  discovery_date        date not null,

  project_id            uuid not null references devtunnel.projects (id) on delete cascade,
  issue_number          integer not null,
  issue_title           text not null,
  issue_url             text not null,
  issue_body            text,
  issue_labels          jsonb not null default '[]'::jsonb,
  github_author         jsonb,

  suggested_roles       devtunnel.developer_role[] not null default '{}',
  suggested_difficulty  devtunnel.experience_level,
  ai_reasoning          text not null,

  status                devtunnel.ai_discovery_status not null default 'PENDING',
  reviewed_by           uuid references devtunnel.users (id) on delete set null,
  reviewed_at           timestamptz,
  completed_task_id     uuid references devtunnel.tasks (id) on delete set null,

  created_at            timestamptz not null default now()
);

create unique index if not exists ai_discovered_tasks_project_issue_active_key
  on devtunnel.ai_discovered_tasks (project_id, issue_number)
  where status in ('PENDING', 'APPROVED');

create index if not exists ai_discovered_tasks_status_idx
  on devtunnel.ai_discovered_tasks (status, created_at desc);

alter table devtunnel.ai_discovered_tasks enable row level security;
revoke all on devtunnel.ai_discovered_tasks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- approve_ai_discovered_project — mirrors complete_project_onboarding
-- (sql/006), sourcing from the candidate row instead of an admin draft.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.approve_ai_discovered_project(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
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
    description_source, tech_stack, status
  ) values (
    v_row.github_repo_name, v_slug, v_row.github_description, v_row.repository_url, p_admin_id,
    v_row.github_owner, v_row.github_repo_name, v_row.github_full_name, v_row.github_description,
    v_row.readme, v_row.primary_language, v_row.stars, v_row.forks, v_row.open_issues,
    'EXISTING', coalesce(v_row.tech_stack, '{}'::jsonb), 'ACTIVE'
  )
  returning devtunnel.projects.id into v_project_id;

  update devtunnel.ai_discovered_projects
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_project_id = v_project_id
  where devtunnel.ai_discovered_projects.id = p_id;

  return query select p.id, p.slug, p.name from devtunnel.projects p where p.id = v_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_ai_discovered_tool — mirrors complete_opensource_tool_onboarding
-- (sql/017).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.approve_ai_discovered_tool(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, name text)
language plpgsql
as $$
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
    'EXISTING', null, coalesce(v_row.labels, '[]'::jsonb),
    coalesce('Category: ' || v_row.category || E'\n\n' || v_row.ai_reasoning, ''),
    p_admin_id
  )
  returning devtunnel.opensource_tools.id into v_tool_id;

  update devtunnel.ai_discovered_tools
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_tool_id = v_tool_id
  where devtunnel.ai_discovered_tools.id = p_id;

  return query select t.id, t.slug, t.name from devtunnel.opensource_tools t where t.id = v_tool_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_ai_discovered_task — mirrors complete_task_onboarding (sql/012,
-- sql/019). Inserts directly into devtunnel.tasks against the real
-- columns that migration added (slug, github_issue_number,
-- github_issue_url, github_issue_snapshot, roles, difficulty).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.approve_ai_discovered_task(p_id uuid, p_admin_id uuid)
returns table (id uuid, slug text, title text, project_slug text)
language plpgsql
as $$
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
    v_row.ai_reasoning, coalesce(v_row.suggested_roles, '{}'), v_row.suggested_difficulty
  )
  returning devtunnel.tasks.id into v_task_id;

  update devtunnel.ai_discovered_tasks
  set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), completed_task_id = v_task_id
  where devtunnel.ai_discovered_tasks.id = p_id;

  return query
    select t.id, t.slug, t.title, v_project_slug from devtunnel.tasks t where t.id = v_task_id;
end;
$$;