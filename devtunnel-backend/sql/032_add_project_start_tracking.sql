-- DevTunnel — `dev start` project-claim tracking (mirrors sql/030 for tasks).
--
-- devtunnel.projects already has a `status` column (sql/006,
-- devtunnel.project_status — currently just 'ACTIVE') that means the
-- project's *publish* state, not a claim workflow. Reusing that name for
-- "claimed / in progress / done" would collide with an unrelated,
-- already-shipped concept, so the claim-workflow column here is
-- `claim_status`, reusing the existing devtunnel.task_status enum type
-- (OPEN/IN_PROGRESS/IN_REVIEW/DONE, sql/004 + sql/031) rather than
-- inventing a near-duplicate enum.
--
-- Run once, after 031_add_task_submit_tracking.sql.

alter table devtunnel.projects
  add column if not exists claim_status            devtunnel.task_status not null default 'OPEN',
  add column if not exists assignee_id              uuid references devtunnel.users (id) on delete set null,
  add column if not exists assignee_started_at      timestamptz,
  add column if not exists assignee_fork_full_name   text,
  add column if not exists assignee_branch           text;

create index if not exists projects_assignee_id_idx on devtunnel.projects (assignee_id);
create index if not exists projects_claim_status_idx on devtunnel.projects (claim_status);

-- ---------------------------------------------------------------------------
-- admin_project_list (sql/015) — append the five new columns at the very
-- end of the select list. `create or replace view` can only add trailing
-- columns; inserting them anywhere else shifts every column after them
-- out of position, which Postgres rejects (see sql/015's own note on this
-- exact rule — tech_stack there was appended last for the same reason).
-- ---------------------------------------------------------------------------
create or replace view devtunnel.admin_project_list as
select
  p.id                          as id,
  p.slug                        as slug,
  p.name                        as name,
  p.repo_url                    as repo_url,
  p.github_full_name            as github_full_name,
  p.github_owner                as github_owner,
  p.github_author               as github_author,
  p.status                      as status,
  p.created_at                  as created_at,

  coalesce(jsonb_array_length(p.github_contributors), 0) as github_contributor_count,

  (
    select count(*)
    from devtunnel.tasks t
    where t.project_id = p.id
      and t.deleted_at is null
  ) as task_count,

  (
    select count(distinct contributor_id)
    from (
      select t.assignee_id as contributor_id
      from devtunnel.tasks t
      where t.project_id = p.id
        and t.deleted_at is null
        and t.status = 'DONE'
        and t.assignee_id is not null
      union
      select pr.author_id as contributor_id
      from devtunnel.pull_requests pr
      where pr.project_id = p.id
        and pr.status = 'MERGED'
    ) devtunnel_contributors
  ) as devtunnel_contributor_count,

  p.tech_stack                  as tech_stack,

  -- New in this migration — appended last, deliberately (see header).
  p.claim_status               as claim_status,
  p.assignee_id                 as assignee_id,
  p.assignee_started_at         as assignee_started_at,
  p.assignee_fork_full_name     as assignee_fork_full_name,
  p.assignee_branch             as assignee_branch

from devtunnel.projects p
where p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- start_project — atomically claims a whole project for `dev start
-- --project`, mirroring devtunnel.start_task (sql/030) column-for-column
-- except for the claim_status/status naming difference above. Same
-- row-lock, same idempotent-resume-for-the-same-user behavior, same
-- TASK_ALREADY_CLAIMED-shaped exceptions (renamed to PROJECT_*).
-- ---------------------------------------------------------------------------
create or replace function devtunnel.start_project(
  p_project_id     uuid,
  p_user_id        uuid,
  p_fork_full_name text,
  p_branch         text
)
returns table (
  id                      uuid,
  claim_status            devtunnel.task_status,
  assignee_id             uuid,
  assignee_started_at     timestamptz,
  assignee_fork_full_name text,
  assignee_branch         text
)
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
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  -- Same contributor re-running `dev start --project` on a project they
  -- already claimed — resume, don't re-claim (see sql/030's start_task).
  if v_project.assignee_id = p_user_id then
    return query
      select p.id, p.claim_status, p.assignee_id, p.assignee_started_at,
             p.assignee_fork_full_name, p.assignee_branch
      from devtunnel.projects p
      where p.id = p_project_id;
    return;
  end if;

  if v_project.assignee_id is not null then
    raise exception 'PROJECT_ALREADY_CLAIMED';
  end if;

  if v_project.claim_status = 'DONE' then
    raise exception 'PROJECT_ALREADY_DONE';
  end if;

  update devtunnel.projects p
  set assignee_id             = p_user_id,
      claim_status            = 'IN_PROGRESS',
      assignee_started_at     = now(),
      assignee_fork_full_name = p_fork_full_name,
      assignee_branch         = p_branch
  where p.id = p_project_id;

  return query
    select p.id, p.claim_status, p.assignee_id, p.assignee_started_at,
           p.assignee_fork_full_name, p.assignee_branch
    from devtunnel.projects p
    where p.id = p_project_id;
end;
$$;