-- DevTunnel — Projects, Tasks, Pull Requests & DevTunnel-native activity
-- (extends Module C1 auth schema; backs the profile page's "Projects
-- created", "Tasks done", "Pull requests merged" stats and the
-- DevTunnel-side contribution calendar — see
-- devtunnel-backend/src/routes/devtunnelStats.ts).
--
-- Run once, after 003_add_github_oauth_tokens.sql.
--
-- These are genuinely new tables, not a restatement of the GitHub-backed
-- data in src/routes/contributions.ts: GitHub only knows about GitHub
-- activity. DevTunnel-native activity (a task marked done inside
-- DevTunnel, a project created on DevTunnel, a PR DevTunnel tracked to
-- merged) has no other system of record, so it needs its own tables
-- before the profile page can show it truthfully — never fabricate a
-- metric, build the table it actually comes from.

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.task_status as enum ('OPEN', 'IN_PROGRESS', 'DONE');
  end if;
  if not exists (select 1 from pg_type where typname = 'pull_request_status' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.pull_request_status as enum ('OPEN', 'MERGED', 'CLOSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'activity_type' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.activity_type as enum ('PROJECT_CREATED', 'TASK_COMPLETED', 'PULL_REQUEST_MERGED');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- projects — a DevTunnel-native open source project listing.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  description  text,
  repo_url     text,
  created_by   uuid not null references devtunnel.users (id) on delete cascade,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_created_by_idx on devtunnel.projects (created_by);

drop trigger if exists projects_set_updated_at on devtunnel.projects;
create trigger projects_set_updated_at
  before update on devtunnel.projects
  for each row execute function devtunnel.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_maintainers — many-to-many. A user can maintain zero, one, or
-- several projects, independent of their account-level `users.role`.
-- This is what lets a CONTRIBUTOR-role account also show a "Maintainer"
-- badge on their profile (see devtunnel-frontend
-- components/profile/profile-tags.tsx) — maintaining a project and a
-- platform-wide account role are two different, both-real facts, not an
-- either/or account type.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.project_maintainers (
  project_id  uuid not null references devtunnel.projects (id) on delete cascade,
  user_id     uuid not null references devtunnel.users (id) on delete cascade,
  added_at    timestamptz not null default now(),

  primary key (project_id, user_id)
);

create index if not exists project_maintainers_user_id_idx on devtunnel.project_maintainers (user_id);

-- A project's creator is always a maintainer of their own project.
create or replace function devtunnel.add_creator_as_maintainer()
returns trigger as $$
begin
  insert into devtunnel.project_maintainers (project_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_add_creator_as_maintainer on devtunnel.projects;
create trigger projects_add_creator_as_maintainer
  after insert on devtunnel.projects
  for each row execute function devtunnel.add_creator_as_maintainer();

-- ---------------------------------------------------------------------------
-- tasks — a unit of contributor work inside a project.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references devtunnel.projects (id) on delete cascade,
  title         text not null,
  status        devtunnel.task_status not null default 'OPEN',
  assignee_id   uuid references devtunnel.users (id) on delete set null,
  created_by    uuid not null references devtunnel.users (id) on delete cascade,

  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists tasks_assignee_id_idx on devtunnel.tasks (assignee_id);
create index if not exists tasks_project_id_idx on devtunnel.tasks (project_id);
create index if not exists tasks_status_idx on devtunnel.tasks (status);

-- ---------------------------------------------------------------------------
-- pull_requests — a PR DevTunnel tracked against a task/project. May
-- correspond to a real GitHub PR (`github_pr_url`), but is recorded
-- DevTunnel-side so "merged through DevTunnel" is a real, queryable fact
-- rather than re-derived from the separate GitHub contribution calendar.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.pull_requests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references devtunnel.projects (id) on delete cascade,
  task_id        uuid references devtunnel.tasks (id) on delete set null,
  author_id      uuid not null references devtunnel.users (id) on delete cascade,
  github_pr_url  text,
  status         devtunnel.pull_request_status not null default 'OPEN',

  created_at     timestamptz not null default now(),
  merged_at      timestamptz
);

create index if not exists pull_requests_author_id_idx on devtunnel.pull_requests (author_id);
create index if not exists pull_requests_status_idx on devtunnel.pull_requests (status);

-- ---------------------------------------------------------------------------
-- activity_log — one row per DevTunnel-native contribution event, purely
-- to back the DevTunnel "green squares" calendar
-- (GET /users/me/contributions/devtunnel) the same way GitHub's own
-- contributionsCollection backs the GitHub calendar
-- (src/lib/githubGraphql.ts). Populated exclusively by the triggers
-- below, never by application code directly, so it can't drift from the
-- tables it summarizes.
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.activity_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references devtunnel.users (id) on delete cascade,
  type             devtunnel.activity_type not null,
  occurred_at      timestamptz not null default now(),
  project_id       uuid references devtunnel.projects (id) on delete set null,
  task_id          uuid references devtunnel.tasks (id) on delete set null,
  pull_request_id  uuid references devtunnel.pull_requests (id) on delete set null
);

create index if not exists activity_log_user_occurred_idx on devtunnel.activity_log (user_id, occurred_at);

create or replace function devtunnel.log_project_created()
returns trigger as $$
begin
  insert into devtunnel.activity_log (user_id, type, occurred_at, project_id)
  values (new.created_by, 'PROJECT_CREATED', new.created_at, new.id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_log_activity on devtunnel.projects;
create trigger projects_log_activity
  after insert on devtunnel.projects
  for each row execute function devtunnel.log_project_created();

create or replace function devtunnel.log_task_completed()
returns trigger as $$
begin
  if new.status = 'DONE' and (old.status is distinct from 'DONE') and new.assignee_id is not null then
    new.completed_at := coalesce(new.completed_at, now());
    insert into devtunnel.activity_log (user_id, type, occurred_at, project_id, task_id)
    values (new.assignee_id, 'TASK_COMPLETED', new.completed_at, new.project_id, new.id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_log_activity on devtunnel.tasks;
create trigger tasks_log_activity
  before update on devtunnel.tasks
  for each row execute function devtunnel.log_task_completed();

create or replace function devtunnel.log_pull_request_merged()
returns trigger as $$
begin
  if new.status = 'MERGED' and (old.status is distinct from 'MERGED') then
    new.merged_at := coalesce(new.merged_at, now());
    insert into devtunnel.activity_log (user_id, type, occurred_at, project_id, task_id, pull_request_id)
    values (new.author_id, 'PULL_REQUEST_MERGED', new.merged_at, new.project_id, new.task_id, new.id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pull_requests_log_activity on devtunnel.pull_requests;
create trigger pull_requests_log_activity
  before update on devtunnel.pull_requests
  for each row execute function devtunnel.log_pull_request_merged();

-- ---------------------------------------------------------------------------
-- Access control — same posture as 001_create_schema.sql: this backend
-- talks to Supabase exclusively with the service role key, which bypasses
-- RLS by design. RLS is enabled anyway as defense in depth, with zero
-- grants to anon/authenticated.
-- ---------------------------------------------------------------------------
alter table devtunnel.projects enable row level security;
alter table devtunnel.project_maintainers enable row level security;
alter table devtunnel.tasks enable row level security;
alter table devtunnel.pull_requests enable row level security;
alter table devtunnel.activity_log enable row level security;

revoke all on devtunnel.projects from anon, authenticated;
revoke all on devtunnel.project_maintainers from anon, authenticated;
revoke all on devtunnel.tasks from anon, authenticated;
revoke all on devtunnel.pull_requests from anon, authenticated;
revoke all on devtunnel.activity_log from anon, authenticated;