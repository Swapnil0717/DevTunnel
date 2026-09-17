-- DevTunnel — `dev submit` task-submission tracking.
--
-- `dev start` (sql/030) taught `devtunnel.tasks` how to record a claim.
-- This is the other half: `dev submit` needs somewhere to record that a
-- PR was opened for that claim, and a task-visible signal that it's now
-- waiting on review rather than still being worked on.
--
-- Run once, after 030_add_task_start_tracking.sql.
--
-- NOTE ON THE ENUM ADD BELOW: Postgres cannot use a newly-added enum
-- value inside the same transaction that added it. If your migration
-- runner wraps this whole file in one transaction, run the
-- `alter type ... add value` statement by itself first, then the rest of
-- this file. Supabase's SQL editor runs each statement standalone, so
-- pasting the whole file there is fine as-is.

alter type devtunnel.task_status add value if not exists 'IN_REVIEW' after 'IN_PROGRESS';

-- `devtunnel.pull_requests` (sql/004) already existed but nothing ever
-- wrote to it — same situation `assignee_*` was in before sql/030. Adds
-- the fields `dev submit` actually has on hand: the PR number (so a
-- future "open it in your browser" doesn't have to re-derive it from the
-- URL), the branch it was opened from, and its title.
alter table devtunnel.pull_requests
  add column if not exists github_pr_number int,
  add column if not exists branch           text,
  add column if not exists title            text;

-- One open PR per task at a time. `dev submit` re-run on the same task
-- (new commits pushed, same branch) must update this same row rather than
-- insert a second one — see `submit_task` below.
create unique index if not exists pull_requests_task_id_open_idx
  on devtunnel.pull_requests (task_id)
  where status = 'OPEN' and task_id is not null;

-- ---------------------------------------------------------------------------
-- submit_task — atomically records a `dev submit` for `dev submit
-- <task-id>` (src/routes/tasks.ts `POST /tasks/:id/submit`). Mirrors
-- `start_task` (sql/030): `select ... for update` row-locks the task so
-- two concurrent submits for the same task can't interleave, raises a
-- specific exception per precondition, mutates, returns the updated row.
--
-- Idempotent for the *same* contributor re-submitting the *same* task
-- (pushed new commits, ran `dev submit` again): the existing OPEN
-- `pull_requests` row for this task is updated in place with the latest
-- PR url/number/branch/title rather than inserting a duplicate — the
-- route already found GitHub's own existing PR in this case
-- (src/lib/githubPullRequest.ts `findOpenPullRequest`), so this just
-- keeps DevTunnel's own record in sync with it.
--
-- A task with no assignee, or assigned to someone else, is rejected with
-- TASK_NOT_YOURS — `dev submit` only ever runs against the caller's own
-- `dev start` claim. A `DONE` task can't be re-submitted.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.submit_task(
  p_task_id     uuid,
  p_user_id     uuid,
  p_pr_url      text,
  p_pr_number   int,
  p_branch      text,
  p_title       text
)
returns table (
  id                uuid,
  status            devtunnel.task_status,
  pull_request_id   uuid,
  github_pr_url     text,
  github_pr_number  int
)
language plpgsql
as $$
declare
  v_task devtunnel.tasks%rowtype;
  v_pr   devtunnel.pull_requests%rowtype;
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

  if v_task.assignee_id is distinct from p_user_id then
    raise exception 'TASK_NOT_YOURS';
  end if;

  if v_task.status = 'DONE' then
    raise exception 'TASK_ALREADY_DONE';
  end if;

  -- Reuse this task's existing OPEN pull_requests row if `dev submit` was
  -- already run for it (see header comment) — row-locked too, so a second
  -- concurrent submit for the same task waits rather than racing an insert
  -- against an update.
  select * into v_pr
  from devtunnel.pull_requests pr
  where pr.task_id = p_task_id and pr.status = 'OPEN'
  for update;

  if found then
    update devtunnel.pull_requests
    set github_pr_url    = p_pr_url,
        github_pr_number = p_pr_number,
        branch            = p_branch,
        title             = p_title
    where pull_requests.id = v_pr.id
    returning * into v_pr;
  else
    insert into devtunnel.pull_requests (
      project_id, task_id, author_id, github_pr_url, github_pr_number, branch, title, status
    )
    values (
      v_task.project_id, p_task_id, p_user_id, p_pr_url, p_pr_number, p_branch, p_title, 'OPEN'
    )
    returning * into v_pr;
  end if;

  -- Only ever moves a task forward (IN_PROGRESS -> IN_REVIEW) — a
  -- re-submit while already IN_REVIEW leaves status untouched rather than
  -- redundantly rewriting it.
  if v_task.status = 'IN_PROGRESS' then
    update devtunnel.tasks
    set status = 'IN_REVIEW'
    where tasks.id = p_task_id;
  end if;

  return query
    select t.id, t.status, v_pr.id, v_pr.github_pr_url, v_pr.github_pr_number
    from devtunnel.tasks t
    where t.id = p_task_id;
end;
$$;