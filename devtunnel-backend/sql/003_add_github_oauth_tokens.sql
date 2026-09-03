-- DevTunnel — Per-user GitHub OAuth token storage (extends Module C1 auth schema)
--
-- Adds encrypted-at-rest columns to store each user's GitHub App
-- user-to-server access token (+ refresh token, when the App has "Expire
-- user authorization tokens" enabled). Used by
-- devtunnel-backend/src/db/githubTokens.ts to call the GitHub GraphQL API
-- (contribution calendar, src/routes/contributions.ts) using each user's
-- own GitHub authorization rather than one shared server-wide token —
-- this correctly reflects each user's own private-contribution
-- visibility and avoids funneling every user's GraphQL calls through a
-- single token's rate limit.
--
-- Tokens are ONLY ever stored encrypted (AES-256-GCM, see
-- src/lib/crypto.ts) using GITHUB_TOKEN_ENCRYPTION_KEY, a secret that
-- lives exclusively in this Worker's bindings. Run once, after
-- 002_add_onboarding_fields.sql.
--
-- Existing users who signed in before this migration will simply have
-- null tokens until they next sign in — src/routes/contributions.ts
-- already handles that as "reconnect GitHub", not an error.

alter table devtunnel.users
  add column if not exists github_access_token_encrypted   text,
  add column if not exists github_access_token_expires_at  timestamptz,
  add column if not exists github_refresh_token_encrypted  text,
  add column if not exists github_refresh_token_expires_at timestamptz;

-- Defense in depth, matching 001_create_schema.sql: these columns are
-- only ever read/written by this backend via the service role key, which
-- bypasses RLS by design. anon/authenticated already have zero grants on
-- this table (see 001_create_schema.sql) — restated here for clarity,
-- not because anything changed.