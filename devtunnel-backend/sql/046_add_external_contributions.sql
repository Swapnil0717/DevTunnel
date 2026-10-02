-- DevTunnel — count `dev start` / `dev submit` work on ANY public GitHub
-- repository as a DevTunnel contribution, even when the repository or issue
-- is not a DevTunnel project or task.
--
-- Run once, after 045_log_pull_request_submitted.sql.
--
-- WHAT COUNTS (same rule DevTunnel already uses for its own tasks):
--   * `dev start owner/repo#123`  -> a row with status STARTED. Intent only;
--                                    it does NOT move the calendar or totals.
--   * `dev submit`                -> the row gets the PR url and status OPEN,
--                                    and ONE PULL_REQUEST_SUBMITTED activity_log
--                                    row is written (calendar, 365-day total,
--                                    milestone "active day" strip).
--   * the PR is merged on GitHub  -> status MERGED (set by lib/prSync.ts) and
--                                    ONE PULL_REQUEST_MERGED activity_log row.
--   * the PR is closed unmerged   -> status CLOSED; nothing is removed from the
--                                    calendar, same as a closed DevTunnel PR.
--
-- activity_log rows for these have project_id / task_id / pull_request_id all
-- NULL (those columns are nullable, sql/004) because there is no DevTunnel
-- project, task or pull_requests row behind them.

create schema if not exists devtunnel; -- no-op if 001 already ran

create table if not exists devtunnel.external_contributions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references devtunnel.users (id) on delete cascade,

  -- Lower-cased `owner/repo` (the lookup key) and GitHub's own casing.
  repository_key        text not null,
  repository_full_name  text not null,
  repository_url        text not null,

  issue_number          int,
  issue_title           text,

  fork_full_name        text,
  branch                text not null,

  status                text not null default 'STARTED'
                        check (status in ('STARTED', 'OPEN', 'MERGED', 'CLOSED')),

  github_pr_url         text,
  github_pr_number      int,
  pr_title              text,

  started_at            timestamptz not null default now(),
  submitted_at          timestamptz,
  merged_at             timestamptz,

  -- One row per (contributor, repository, branch): re-running `dev start` or
  -- `dev submit` updates the row instead of adding another.
  unique (user_id, repository_key, branch)
);

create index if not exists external_contributions_user_idx
  on devtunnel.external_contributions (user_id, started_at desc);

-- The merge-sync job only looks at open PRs.
create index if not exists external_contributions_open_idx
  on devtunnel.external_contributions (submitted_at)
  where status = 'OPEN';

create or replace function devtunnel.log_external_contribution()
returns trigger as $$
begin
  -- PR submitted: the first time a row gets a PR url. Logged once per row.
  if new.github_pr_url is not null
     and (tg_op = 'INSERT' or old.github_pr_url is null) then
    insert into devtunnel.activity_log (user_id, type, occurred_at)
    values (new.user_id, 'PULL_REQUEST_SUBMITTED', coalesce(new.submitted_at, now()));
  end if;

  -- PR merged: the transition into MERGED. Logged once per row.
  if new.status = 'MERGED'
     and (tg_op = 'INSERT' or old.status is distinct from 'MERGED') then
    insert into devtunnel.activity_log (user_id, type, occurred_at)
    values (new.user_id, 'PULL_REQUEST_MERGED', coalesce(new.merged_at, now()));
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists external_contributions_log on devtunnel.external_contributions;
create trigger external_contributions_log
  after insert or update on devtunnel.external_contributions
  for each row execute function devtunnel.log_external_contribution();

-- Same access posture as every other table in this schema (sql/001): the
-- backend uses the service role key; RLS on with no policies and no grants
-- for anon/authenticated is defense in depth.
alter table devtunnel.external_contributions enable row level security;
revoke all on devtunnel.external_contributions from anon, authenticated;