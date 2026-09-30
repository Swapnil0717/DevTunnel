-- DevTunnel — AI summaries (Part 4).
--
-- WHY: every project / tool detail page shows a short AI-written summary.
-- Generating one costs a model call from a free-tier budget, so it is done
-- ONCE and stored here; later visits read this row and make no AI call.
-- (Workers KV is deliberately not used: Workers Free allows only 1,000 KV
-- writes a day, and summaries are durable data anyway — Part 1 rule 3.)
--
-- One row per (kind, subject_key):
--   kind         devtunnel_project | devtunnel_tool | github_project |
--                github_tool | community_project
--   subject_key  the page's slug, lower-cased for the two GitHub kinds
--                (`owner--repo`), as-is for the DevTunnel/community kinds.
--
-- content_hash fingerprints exactly what the model was shown (name,
-- description, tech, README as truncated for the prompt, plus the prompt
-- version). The Worker regenerates only when the hash CHANGED and the stored
-- summary is older than its minimum age (see src/lib/ai/summaries.ts).
--
-- Timestamps, on purpose three of them:
--   created_at   first time a summary was stored for this subject
--   updated_at   when the summary was last (re)GENERATED  <- the "age" the
--                minimum-regeneration rule looks at
--   checked_at   last time the Worker compared the source with content_hash;
--                lets a repeat visit skip re-fetching the README from GitHub
--                for a day. (The plan's column list had no checked_at; it is
--                an addition so a "same source" check doesn't have to
--                overwrite updated_at and reset the age.)
--
-- summary is plain JSON, validated + sanitised by the Worker before it is
-- written: { tldr, whatItDoes, techStack[], goodFor[], setupDifficulty }.
-- The frontend renders it as text only, never as HTML.
--
-- Run once, after 038_ai_usage_and_settings.sql. Safe to re-run.

create table if not exists devtunnel.ai_summaries (
  kind          text        not null,
  subject_key   text        not null,
  content_hash  text        not null,
  summary       jsonb       not null,
  provider      text        not null,
  model         text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  checked_at    timestamptz not null default now(),
  constraint ai_summaries_kind_check check (
    kind in ('devtunnel_project', 'devtunnel_tool', 'github_project', 'github_tool', 'community_project')
  ),
  constraint ai_summaries_subject_unique unique (kind, subject_key)
);

-- Same access model as every other devtunnel table: RLS on, no policies,
-- anon/authenticated locked out; only the Worker's service-role key reads or
-- writes (see sql/README.md section 4).
alter table devtunnel.ai_summaries enable row level security;
revoke all on devtunnel.ai_summaries from anon, authenticated;