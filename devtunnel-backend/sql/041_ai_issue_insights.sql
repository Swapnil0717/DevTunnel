-- DevTunnel — AI issue insights (Part 6).
--
-- WHY: the Issues tab of a repository page can show an "AI issue insights"
-- card: which roles / experience levels / technologies the repository's open
-- issues call for, plus a per-issue role + level + tech label that the page's
-- filter chips use. Producing it costs ONE model call over the repository's
-- whole (capped) issue list, so it is done once and stored here; later
-- visits read this row and make no AI call. (Workers KV is deliberately not
-- used: Workers Free allows only 1,000 KV writes a day, and insights are
-- durable data anyway — Part 1 rule 3.)
--
-- One row per repository (the insights describe the repo's issue list, not a
-- page that shows it, so GitHub-catalog pages and DevTunnel project / tool
-- pages share the row):
--   repo_full_name      `owner/repo`, LOWER-CASED (GitHub names are
--                       case-insensitive; one repo must not get two rows)
--   issues_fingerprint  sha256 of the prompt version + the analysed issues'
--                       (number, updated_at) list. Same list -> same hash.
--   insights            plain JSON, validated + sanitised by the Worker
--                       before it is written (see
--                       src/lib/ai/prompts/insights.ts):
--                       { overview, byRole{}, byLevel{}, topTechStack[],
--                         bestFor{roles[],levels[],techStack[]},
--                         issues[{ number, role, level, techStack[], oneLine }] }
--                       Roles/levels are the existing DeveloperRole /
--                       ExperienceLevel enums; the counts are computed by
--                       the Worker from `issues`, never taken from the model.
--   provider, model     which provider/model wrote it
--   generated_at        when the insights were last (RE)GENERATED <- the
--                       "age" the 6-hour minimum-regeneration rule reads
--   checked_at          last time the Worker compared the live issue list
--                       with issues_fingerprint and found it unchanged (or
--                       regenerated). Lets a repeat visit skip the GitHub
--                       call for a day without resetting the age. (Column
--                       added beyond the Part 6 spec; it is what implements
--                       "at most once a day when nothing changed".)
--
-- The frontend renders the JSON as text only, never as HTML.
--
-- Run once, after 040_ai_issue_explanations.sql. Safe to re-run.

create table if not exists devtunnel.ai_issue_insights (
  repo_full_name      text        primary key,
  issues_fingerprint  text        not null,
  insights            jsonb       not null,
  provider            text        not null,
  model               text        not null,
  generated_at        timestamptz not null default now(),
  checked_at          timestamptz not null default now(),
  constraint ai_issue_insights_repo_lower_check check (repo_full_name = lower(repo_full_name))
);

-- Same access model as every other devtunnel table: RLS on, no policies,
-- anon/authenticated locked out; only the Worker's service-role key reads or
-- writes (see sql/README.md section 4).
alter table devtunnel.ai_issue_insights enable row level security;
revoke all on devtunnel.ai_issue_insights from anon, authenticated;