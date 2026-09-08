-- DevTunnel — Admin Task Onboarding, Step 2 ("Select Existing Issue") and
-- Step 3 ("Issue Information") — admin_workflow.txt section 10; section 25
-- ("Task Onboarding State").
--
-- Extends devtunnel.task_onboarding_drafts (sql/009) with exactly the
-- columns Steps 2–3 need. Per Backend_Development_Rules.txt rule 5, this
-- does NOT add columns for Steps 4–7 (tech-stack attachment, difficulty,
-- preview, final validation, completion) — those get their own migration(s)
-- when they're built, same convention sql/009's header already set.
--
-- Run once, after 009_add_task_onboarding.sql.

-- ---------------------------------------------------------------------------
-- Step 2 — Select Existing Issue
--
-- `issue_number` is the GitHub issue number the admin picked from
-- `GET /admin/projects/:id/github/issues` — never freely typed by the
-- admin ("The Admin should not need to manually type an issue number if
-- it already exists on GitHub"). It is only ever written after the
-- backend has independently re-fetched and validated that exact issue
-- number against GitHub itself (src/db/taskOnboarding.ts
-- `selectTaskOnboardingIssue`) — never trusted purely because it was
-- offered in an earlier list response (rule 15: never trust frontend
-- validation; re-verify server-side on every mutating request).
--
-- `github_issue` is a jsonb snapshot of that re-fetched issue (the
-- `GithubIssueSummary` shape — title, body, state, labels, author,
-- comment count, timestamps) taken at selection time. Snapshotting here
-- (rather than re-fetching from GitHub on every later read of the draft)
-- means Step 3's "Issue Information" screen and the eventual task preview
-- always show the exact issue content the admin actually selected, even
-- if the underlying GitHub issue is edited afterward — consistent with
-- "Do not modify the original GitHub issue unless explicitly required."
--
-- `issue_selected` is section 25's second backend-authoritative
-- onboarding-state boolean, only ever flipped by the backend, same
-- posture as `project_selected` (sql/009).
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists issue_number   integer,
  add column if not exists github_issue   jsonb,
  add column if not exists issue_selected boolean not null default false;

-- An issue selection is only ever a *whole* re-fetched snapshot — never a
-- bare number with no snapshot, or a snapshot with no number. This mirrors
-- how sql/006 constrains `description_source`/`custom_description`
-- together for Project Onboarding's Step 2 (rule 25: use database
-- constraints, don't rely on application code alone to keep two columns
-- in sync).
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_issue_selection_consistent;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_issue_selection_consistent
  check (
    (issue_selected = false and issue_number is null and github_issue is null)
    or
    (issue_selected = true and issue_number is not null and github_issue is not null)
  );

-- ---------------------------------------------------------------------------
-- Step 3 — Issue Information
--
-- `issue_information_choice` stores the spec's exact two options verbatim
-- — "Use Existing Issue Information" vs. "Use Existing Issue Information +
-- Custom Information." `custom_description` is DevTunnel-only task
-- metadata layered on top of (never a rewrite of) `github_issue`'s own
-- body — "The custom information belongs to DevTunnel."
--
-- `issue_information_completed` is section 25's third backend-
-- authoritative boolean.
-- ---------------------------------------------------------------------------
alter table devtunnel.task_onboarding_drafts
  add column if not exists issue_information_choice   text,
  add column if not exists custom_description          text,
  add column if not exists issue_information_completed boolean not null default false;

alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_issue_information_choice_check;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_issue_information_choice_check
  check (issue_information_choice is null or issue_information_choice in ('EXISTING', 'CUSTOM'));

-- Same "whole snapshot or nothing" consistency as the issue-selection
-- constraint above, plus: a CUSTOM choice must actually carry custom text
-- (the route's Zod schema already requires this — this constraint is the
-- database-level backstop, rule 25).
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_issue_information_consistent;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_issue_information_consistent
  check (
    (issue_information_completed = false and issue_information_choice is null)
    or
    (issue_information_completed = true and issue_information_choice is not null
      and (issue_information_choice = 'EXISTING' or custom_description is not null))
  );

-- Issue information can only ever be completed after an issue has been
-- selected (Step 3 comes strictly after Step 2 in the mandatory flow) —
-- enforced again in src/db/taskOnboarding.ts (`step_incomplete`), this is
-- the database-level backstop for the same rule.
alter table devtunnel.task_onboarding_drafts
  drop constraint if exists task_onboarding_drafts_issue_info_requires_issue;
alter table devtunnel.task_onboarding_drafts
  add constraint task_onboarding_drafts_issue_info_requires_issue
  check (issue_information_completed = false or issue_selected = true);