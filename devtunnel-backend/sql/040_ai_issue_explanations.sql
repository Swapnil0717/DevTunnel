-- DevTunnel — AI issue explanations (Part 5).
--
-- WHY: every issue row can show an "Explain" panel: a plain-language summary
-- of what the issue asks for, what skills it needs and how to start.
-- Generating one costs a model call from a free-tier budget, so it is done
-- ONCE and stored here; later clicks read this row and make no AI call.
-- (Workers KV is deliberately not used: Workers Free allows only 1,000 KV
-- writes a day, and explanations are durable data anyway — Part 1 rule 3.)
--
-- One row per (source, repo_full_name, issue_number):
--   source          github | devtunnel   which kind of page the "Explain"
--                                        click came from (a raw GitHub
--                                        catalog page, or a DevTunnel
--                                        project / tool / issues page)
--   repo_full_name  `owner/repo`, LOWER-CASED (GitHub names are
--                   case-insensitive; one repo must not get two rows)
--   issue_number    the GitHub issue number
--
-- content_hash fingerprints exactly what the model was shown about the ISSUE
-- (title, labels, body and the first comments, as truncated for the prompt,
-- plus the prompt version). The repo description and README excerpt are
-- context, not part of the fingerprint: a README edit alone does not make an
-- explanation of a specific issue stale. The Worker regenerates only when the
-- hash CHANGED and the stored explanation is older than its minimum age
-- (see src/lib/ai/issueExplanations.ts).
--
-- Timestamps (same three as ai_summaries, same reasons):
--   created_at   first time an explanation was stored for this issue
--   updated_at   when the explanation was last (re)GENERATED  <- the "age"
--                the minimum-regeneration rule looks at
--   checked_at   last time the Worker compared the live issue with
--                content_hash; lets a repeat click skip the GitHub call for
--                a day without resetting the age
--
-- explanation is plain JSON, validated + sanitised by the Worker before it is
-- written:
--   { plainSummary, whatNeedsToBeDone[], skillsNeeded[],
--     difficulty (BEGINNER|INTERMEDIATE|ADVANCED|null), firstSteps[], caveats[] }
-- The frontend renders it as text only, never as HTML.
--
-- Run once, after 039_ai_summaries.sql. Safe to re-run.

create table if not exists devtunnel.ai_issue_explanations (
  source          text        not null,
  repo_full_name  text        not null,
  issue_number    integer     not null,
  content_hash    text        not null,
  explanation     jsonb       not null,
  provider        text        not null,
  model           text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  checked_at      timestamptz not null default now(),
  constraint ai_issue_explanations_source_check check (source in ('github', 'devtunnel')),
  constraint ai_issue_explanations_number_check check (issue_number > 0),
  constraint ai_issue_explanations_repo_lower_check check (repo_full_name = lower(repo_full_name)),
  constraint ai_issue_explanations_subject_unique unique (source, repo_full_name, issue_number)
);

-- Same access model as every other devtunnel table: RLS on, no policies,
-- anon/authenticated locked out; only the Worker's service-role key reads or
-- writes (see sql/README.md section 4).
alter table devtunnel.ai_issue_explanations enable row level security;
revoke all on devtunnel.ai_issue_explanations from anon, authenticated;