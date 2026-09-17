-- DevTunnel — `dev submit` project-submission tracking (mirrors sql/031
-- for tasks).
--
-- devtunnel.pull_requests.task_id (sql/004) was already nullable and its
-- own header comment already says it tracks a PR "against a task/project"
-- — this migration is what actually makes that second half real: an open
-- PR against a project with no specific task behind it.
--
-- Run once, after 032_add_project_start_tracking.sql.

-- One open project-level PR per project at a time — the project-level
-- counterpart to pull_requests_task_id_open_idx (sql/031). Scoped to
-- `task_id is null` so this never collides with that index; a project can
-- have many open task-level PRs and, separately, at most one open
-- project-level PR.
create unique index if not exists pull_requests_project_id_open_idx
  on devtunnel.pull_requests (project_id)
  where status = 'OPEN' and task_id is null;

-- ---------------------------------------------------------------------------
-- submit_project — atomically records a `dev submit --project` for
-- `POST /projects/:id/submit`. Mirrors devtunnel.submit_task (sql/031)
-- exactly, substituting claim_status for status and PROJECT_* exceptions
-- for TASK_*. Only ever moves claim_status forward
-- (IN_PROGRESS -> IN_REVIEW); a DONE project can't be re-submitted, and a
-- project with no assignee or assigned to someone else is rejected with
-- PROJECT_NOT_YOURS.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.submit_project(
  p_project_id  uuid,
  p_user_id     uuid,
  p_pr_url      text,
  p_pr_number   int,
  p_branch      text,
  p_title       text
)
returns table (
  id                uuid,
  claim_status      devtunnel.task_status,
  pull_request_id   uuid,
  github_pr_url     text,
  github_pr_number  int
)
language plpgsql
as $$
declare
  v_project devtunnel.projects%rowtype;
  v_pr      devtunnel.pull_requests%rowtype;
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

  if v_project.assignee_id is distinct from p_user_id then
    raise exception 'PROJECT_NOT_YOURS';
  end if;

  if v_project.claim_status = 'DONE' then
    raise exception 'PROJECT_ALREADY_DONE';
  end if;

  -- Reuse this project's existing OPEN, task-less pull_requests row if
  -- `dev submit --project` was already run for it — row-locked too, same
  -- reasoning as submit_task (sql/031).
  select * into v_pr
  from devtunnel.pull_requests pr
  where pr.project_id = p_project_id
    and pr.task_id is null
    and pr.status = 'OPEN'
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
      p_project_id, null, p_user_id, p_pr_url, p_pr_number, p_branch, p_title, 'OPEN'
    )
    returning * into v_pr;
  end if;

  if v_project.claim_status = 'IN_PROGRESS' then
    update devtunnel.projects
    set claim_status = 'IN_REVIEW'
    where projects.id = p_project_id;
  end if;

  return query
    select p.id, p.claim_status, v_pr.id, v_pr.github_pr_url, v_pr.github_pr_number
    from devtunnel.projects p
    where p.id = p_project_id;
end;
$$;