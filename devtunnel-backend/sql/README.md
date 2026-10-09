# Database migrations

DevTunnel stores everything in a dedicated Postgres schema, `devtunnel`, inside a Supabase project. Keeping its own schema means DevTunnel's tables never collide with anything in `public` (or another app sharing the project).

## 1. Apply the migrations

In the Supabase Dashboard → **SQL Editor**, run every file in this folder **in numeric order**, starting with `001_create_schema.sql` (which creates the `devtunnel` schema, the `user_role` enum, and the `users` and `sessions` tables) and ending with the highest-numbered file.

Notes:

- Each migration is written to be re-runnable (`if not exists`, `create or replace`) where practical, but run each file once, in order, on a fresh project.
- **Two files share the number 012.** `012_add_task_onboarding_preview_validation.sql` is the original and `012 add task onboarding preview validation.sql` (with spaces) is a later fix that qualifies column names to avoid an "ambiguous column" error. Both use `create or replace function`, so apply the underscore file first and the spaced file second; the fixed version is the one that remains.
- A few other files (`017`, `019`, `022`) have spaces in their names. The order is still by number.
- Add new changes as a **new, higher-numbered file**. Do not edit a migration that has already been applied.
- Two later migrations are worth knowing: `051_drop_sponsors.sql` removes the sponsorship tables added in `048`/`049`, and `052_account_purge.sql` adds the account-deletion purge used by the daily cron.

## 2. Expose the schema

The backend talks to Postgres through Supabase's REST layer (PostgREST), which only serves explicitly exposed schemas.

Dashboard → **Project Settings → API → Exposed schemas** → add `devtunnel` (alongside `public`) → Save.

## 3. Get the service role key

Dashboard → **Project Settings → API → Project API keys** → `service_role`. Set it as the backend's `SUPABASE_SERVICE_ROLE_KEY` secret (see [`../README.md`](../README.md#secrets)).

Never put this key in frontend code, a `NEXT_PUBLIC_*` variable, or anywhere except the backend's secrets.

## Why Row Level Security is on with no policies

Every table has RLS enabled, no policies, and all privileges revoked from `anon` and `authenticated`. The service role key (used only by the Worker) bypasses RLS, and the backend authorizes every request in code. Any other client, even if `devtunnel` is exposed in the API settings, gets no access to these tables.

## What the migrations cover

| Range | Area |
|---|---|
| 001–003 | Schema, users and sessions, onboarding fields, encrypted GitHub tokens |
| 004–005 | DevTunnel contributions, admin audit log |
| 006–019 | Admin onboarding for projects, tasks and open source tools; soft delete; new issues; multi-select roles |
| 020–024 | AI Discovery and GitHub nominations |
| 025–028 | GitHub stars, catalog memberships, contribution progress, user submissions |
| 029–036 | CLI tokens, start/submit tracking for tasks and projects, tool–project link, settings, profile activity |
| 037–042 | AI discovered task titles, AI usage and settings, summaries, issue explanations, insights, provider status |
| 043 | Tables that replaced Workers KV state (cache, locks, CLI login codes) |
| 044–047 | PR-submitted activity, external contributions, contribution feedback |
| 048–049, 051 | Sponsorships added, then dropped |
| 050 | Bug reports |
| 052 | Account purge |