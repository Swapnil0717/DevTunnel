-- DevTunnel — post-PR feedback from contributors.
--
-- Backs `POST /tasks/:id/feedback` (src/routes/contributionFeedback.ts) and the
-- prompt the task Contribute page shows once a contributor's pull request is
-- open (devtunnel-frontend `components/tasks/post-pr-prompt.tsx`): "Give
-- feedback" saves a 1-5 rating and an optional message here.
--
-- Run once, after 046_add_external_contributions.sql.
--
-- ---------------------------------------------------------------------------
-- WHAT A ROW MEANS, AND DOES NOT MEAN
--
-- Like sql/026 and sql/036, a row records *attention / opinion*, never delivered
-- work. Nothing here feeds `devtunnel_contributor_count` (sql/015) or
-- `devtunnel.activity_log` (sql/004), and it has no bearing on whether a pull
-- request is reviewed or merged. Sponsoring DevTunnel is a redirect to an
-- external payment page and is not recorded anywhere in this database.
--
-- One row per (task, user): sending feedback again for the same task replaces
-- the earlier answer, so a double-click, a retry or two open tabs converge on
-- one row instead of piling up (rule 55).
--
-- Private: nothing reads these rows back to contributors, and RLS is on with
-- no policies (the Worker's service-role key is the only reader/writer), same
-- posture as every other devtunnel table.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

create table if not exists devtunnel.contribution_feedback (
  task_id     uuid not null references devtunnel.tasks (id) on delete cascade,
  user_id     uuid not null references devtunnel.users (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  message     text check (message is null or char_length(message) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (task_id, user_id)
);

-- "Newest feedback first" for an admin or a future dashboard.
create index if not exists contribution_feedback_created_idx
  on devtunnel.contribution_feedback (created_at desc);

alter table devtunnel.contribution_feedback enable row level security;
revoke all on devtunnel.contribution_feedback from anon, authenticated;
