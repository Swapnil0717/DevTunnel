-- DevTunnel — bug reports from the "Found a bug" popup.
--
-- Backs `POST /bug-reports` (src/routes/bugReports.ts) and the admin list
-- `GET /admin/bug-reports` (src/routes/admin/bugReports.ts). The popup is in
-- the app header (devtunnel-frontend `components/layout/app-header.tsx`).
--
-- Run once, after 049 (or after 047 if you never ran the sponsor migrations).
--
-- A row is a message from a visitor, never delivered work: nothing here feeds
-- contribution counts or the activity log.
--
-- `user_id` is null for a signed-out visitor, and becomes null if the account is
-- later deleted (the report is still useful), so deleting an account never
-- blocks on this table.
--
-- `page_url` and `user_agent` are added by the browser/Worker automatically so
-- the reporter doesn't have to type them. No email, IP address or other
-- personal data is stored.
--
-- Private: RLS is on with no policies (the Worker's service-role key is the
-- only reader/writer), same posture as every other devtunnel table.

create schema if not exists devtunnel; -- no-op if 001 already ran

create table if not exists devtunnel.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references devtunnel.users (id) on delete set null,
  title       text not null check (char_length(title) between 3 and 120),
  area        text not null check (area in ('projects', 'tasks', 'cli', 'profile', 'other')),
  severity    text not null check (severity in ('minor', 'broken', 'blocked')),
  description text not null check (char_length(description) between 10 and 2000),
  steps       text check (steps is null or char_length(steps) <= 2000),
  expected    text check (expected is null or char_length(expected) <= 500),
  page_url    text check (page_url is null or char_length(page_url) <= 500),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);

-- "Newest first" for the admin list (keyset pagination on created_at).
create index if not exists bug_reports_created_idx
  on devtunnel.bug_reports (created_at desc);

alter table devtunnel.bug_reports enable row level security;
revoke all on devtunnel.bug_reports from anon, authenticated;

-- ROLLBACK:  drop table if exists devtunnel.bug_reports;