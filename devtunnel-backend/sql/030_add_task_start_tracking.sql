-- DevTunnel — `dev start` task-assignment tracking.
--
-- `devtunnel.tasks.assignee_id` (sql/004) has always existed but nothing
-- in this codebase ever wrote it — it was read-only. `dev start` is the
-- first real "claim this task" write path, so it needs somewhere to
-- record *what* was claimed, not just *who* claimed it: the contributor's
-- fork (so a re-run of `dev start` on the same task is idempotent — same
-- fork, same branch, not a second fork attempt) and the branch name it
-- created (so `dev submit`, landing in a later module, knows what to push
-- and open a PR from without re-deriving it).
--
-- Run once, after 029_add_cli_tokens.sql.

alter table devtunnel.tasks
  add column if not exists assignee_started_at      timestamptz,
  add column if not exists assignee_fork_full_name   text,
  add column if not exists assignee_branch           text;

-- ---------------------------------------------------------------------------
-- admin_task_list — extend the shared view (sql/013) with the three new
-- columns so both the admin task list and the contributor-facing
-- src/db/tasks.ts (which reads the exact same view — see that file's own
-- header comment on why there is deliberately no second, divergent
-- query) can see a task's start-tracking state without a second query.
-- ---------------------------------------------------------------------------
create or replace view devtunnel.admin_task_list as
select
  t.id                       as id,
  t.slug                     as slug,
  t.title                    as title,
  t.status                   as status,
  t.roles                    as roles,
  t.difficulty               as difficulty,
  t.assignee_id              as assignee_id,
  t.assignee_started_at      as assignee_started_at,
  t.assignee_fork_full_name  as assignee_fork_full_name,
  t.assignee_branch          as assignee_branch,
  t.github_issue_number      as github_issue_number,
  t.github_issue_url         as github_issue_url,
  t.github_issue_snapshot    as github_issue_snapshot,
  t.custom_description       as custom_description,
  t.deleted_at                as deleted_at,
  t.created_at                as created_at,
  p.id                        as project_id,
  p.slug                      as project_slug,
  p.name                      as project_name,
  p.repo_url                  as project_repo_url,
  p.github_full_name          as project_github_full_name,
  p.github_author             as project_github_author,
  p.github_owner              as project_github_owner,
  p.tech_stack                as project_tech_stack,
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
-- start_task — atomically claims a task for `dev start`. Mirrors
-- `delete_admin_task` (sql/013): `select ... for update` row-locks the
-- task so two concurrent `dev start` calls (same user double-clicking,
-- or two different contributors racing) can't both succeed, raises a
-- specific exception per precondition rather than a generic constraint
-- error, mutates, returns the updated row.
--
-- Idempotent for the *same* user re-running `dev start` on a task they
-- already claimed (a dropped connection, a CLI crash mid-clone, or just
-- running it again on purpose) — instead of re-claiming, it returns the
-- already-recorded fork/branch so the CLI can resume rather than fail.
-- A *different* user hitting an already-claimed task is rejected with
-- TASK_ALREADY_CLAIMED, and a task that isn't OPEN (already IN_PROGRESS
-- by someone else, or DONE) can't be claimed at all.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.start_task(
  p_task_id      uuid,
  p_user_id      uuid,
  p_fork_full_name text,
  p_branch         text
)
returns table (
  id                      uuid,
  status                  devtunnel.task_status,
  assignee_id             uuid,
  assignee_started_at     timestamptz,
  assignee_fork_full_name text,
  assignee_branch         text
)
language plpgsql
as $$
declare
  v_task devtunnel.tasks%rowtype;
begin
  select * into v_task
  from devtunnel.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  if v_task.deleted_at is not null then
    raise exception 'TASK_NOT_FOUND';
  end if;

  -- Same contributor re-running `dev start` on a task they already
  -- claimed — resume, don't re-claim (see header comment).
  if v_task.assignee_id = p_user_id then
    return query
      select t.id, t.status, t.assignee_id, t.assignee_started_at,
             t.assignee_fork_full_name, t.assignee_branch
      from devtunnel.tasks t
      where t.id = p_task_id;
    return;
  end if;

  if v_task.assignee_id is not null then
    raise exception 'TASK_ALREADY_CLAIMED';
  end if;

  if v_task.status = 'DONE' then
    raise exception 'TASK_ALREADY_DONE';
  end if;

  update devtunnel.tasks t
  set assignee_id             = p_user_id,
      status                  = 'IN_PROGRESS',
      assignee_started_at     = now(),
      assignee_fork_full_name = p_fork_full_name,
      assignee_branch         = p_branch
  where t.id = p_task_id;

  return query
    select t.id, t.status, t.assignee_id, t.assignee_started_at,
           t.assignee_fork_full_name, t.assignee_branch
    from devtunnel.tasks t
    where t.id = p_task_id;
end;
$$;