-- DevTunnel — count a submitted pull request as a DevTunnel contribution
-- (part 2 of 2). Run AFTER 044_add_pr_submitted_activity_type.sql.
--
-- 1. Every new pull_requests row written by `dev submit` logs one
--    PULL_REQUEST_SUBMITTED activity row for its author. That row feeds the
--    DevTunnel contribution calendar, the 365-day contribution total and the
--    "active day" strip on the milestone track (all read activity_log).
--    `dev submit` re-run on the same task updates the existing OPEN row
--    (sql/031), it does not insert a new one, so a PR is logged once.
-- 2. Backfills one row for each PR submitted before this migration (e.g. the
--    ones already opened while testing), using the PR's original created_at.
-- 3. A project's DevTunnel contributor count now includes people with a
--    submitted (OPEN) pull request, not only merged ones, so a contributor
--    counts as soon as their PR is up. CLOSED (rejected) PRs don't count.
--    Same columns, same order as sql/032 — only the subquery changes.

create or replace function devtunnel.log_pull_request_submitted()
returns trigger as $$
begin
  if new.github_pr_url is not null and new.author_id is not null then
    insert into devtunnel.activity_log (user_id, type, occurred_at, project_id, task_id, pull_request_id)
    values (new.author_id, 'PULL_REQUEST_SUBMITTED', new.created_at, new.project_id, new.task_id, new.id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pull_requests_log_submitted on devtunnel.pull_requests;
create trigger pull_requests_log_submitted
  after insert on devtunnel.pull_requests
  for each row execute function devtunnel.log_pull_request_submitted();

-- Backfill (safe to re-run: skips PRs that already have a SUBMITTED row).
insert into devtunnel.activity_log (user_id, type, occurred_at, project_id, task_id, pull_request_id)
select pr.author_id, 'PULL_REQUEST_SUBMITTED', pr.created_at, pr.project_id, pr.task_id, pr.id
from devtunnel.pull_requests pr
where pr.github_pr_url is not null
  and pr.author_id is not null
  and not exists (
    select 1 from devtunnel.activity_log a
    where a.pull_request_id = pr.id and a.type = 'PULL_REQUEST_SUBMITTED'
  );

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
        and pr.status in ('OPEN', 'MERGED')
    ) devtunnel_contributors
  ) as devtunnel_contributor_count,

  p.tech_stack                  as tech_stack,

  p.claim_status                as claim_status,
  p.assignee_id                 as assignee_id,
  p.assignee_started_at         as assignee_started_at,
  p.assignee_fork_full_name     as assignee_fork_full_name,
  p.assignee_branch             as assignee_branch

from devtunnel.projects p
where p.deleted_at is null;