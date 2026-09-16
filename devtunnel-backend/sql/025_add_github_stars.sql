-- DevTunnel — GitHub star tracking, shared by both GitHub catalogs.
--
-- Backs the "Star" action on the Project Detail page
-- (`/github-projects/:slug`) and the Open Source Tools Detail page
-- (`/github-open-source-tools/:slug`) — devtunnel-frontend `StarButton`
-- → `PUT`/`DELETE /github-projects/:slug/star` and
-- `PUT`/`DELETE /github-open-source-tools/:slug/star`
-- (src/routes/githubProjects.ts, src/routes/githubOpenSourceTools.ts).
--
-- Deliberately ONE shared table, not one per catalog (unlike
-- sql/023 + sql/024's separate project/tool nomination tables): a star
-- is a property of "this contributor and this GitHub repository", not
-- of which DevTunnel catalog page it was clicked from — the same
-- `owner/repo` can legitimately appear in both the Projects and Open
-- Source Tools catalogs (their discovery queries are independent,
-- lib/githubCatalog.ts), and it should read as starred on both pages
-- either way, not track two disconnected "is this starred" answers
-- for the same real repository.
--
-- This table is a local record of "which DevTunnel contributors starred
-- this repo through DevTunnel" only — it is NOT the source of truth
-- for a repository's real GitHub star count (that's `stars` on the
-- catalog/detail payload, read live from GitHub's own repo metadata,
-- lib/githubRepo.ts `fetchRepositoryCatalogSummary`). Every row here
-- corresponds to a real `PUT /user/starred/{owner}/{repo}` call already
-- made on the contributor's behalf (lib/githubRepo.ts
-- `starRepositoryForUser`) — this table exists so the frontend can ask
-- "did I star this" and "how many DevTunnel contributors starred this"
-- without re-querying GitHub's own (rate-limited, and per-user-scoped
-- for the "did I star this" half) star endpoints on every page load.
--
-- Run once, after 024_add_github_open_source_tool_nominations.sql.

create schema if not exists devtunnel;

create table if not exists devtunnel.github_stars (
  id                    uuid primary key default gen_random_uuid(),

  repository_full_name  text not null,
  repository_url        text not null,

  starred_by            uuid not null references devtunnel.users (id) on delete cascade,

  created_at            timestamptz not null default now()
);

-- One star per (contributor, repository) — starring an
-- already-starred repository is a no-op on GitHub itself (see
-- lib/githubRepo.ts `starRepositoryForUser`'s doc comment), and the
-- same must hold for this local record: unstar-then-restar creates a
-- fresh row (created_at reflects the most recent star), but a repeat
-- star while already starred never creates a second row.
create unique index if not exists github_stars_starred_by_repo_key
  on devtunnel.github_stars (starred_by, repository_full_name);

-- Backs "how many DevTunnel contributors starred this repository" on
-- both Detail pages — a plain count(*) filtered by repository_full_name,
-- so an index on that column alone (not the composite above, which
-- leads with starred_by) keeps that count cheap.
create index if not exists github_stars_repo_idx
  on devtunnel.github_stars (repository_full_name);

-- Same defense-in-depth posture every table in this schema takes
-- (sql/001 README): this backend is the trusted server-side boundary
-- and authorizes in code via the service role key, never via RLS + a
-- user JWT, so anon/authenticated get no grants at all.
alter table devtunnel.github_stars enable row level security;
revoke all on devtunnel.github_stars from anon, authenticated;