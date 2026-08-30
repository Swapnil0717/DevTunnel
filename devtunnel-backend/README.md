# devtunnel-backend

Backend for [`devtunnel-frontend`](../devtunnel-frontend) — implements
**Module C1 (Authentication)** from `devtunnel_workflow.txt`:
`POST /auth/github`, `GET /auth/callback`, `GET /auth/me`,
`POST /auth/logout`, plus the session middleware those routes share.

Runtime: **Cloudflare Workers** (Hono) + **Supabase Postgres** (via
`@supabase/supabase-js`, service role key, its own `devtunnel` schema —
see `sql/README.md`) + **GitHub OAuth**.

This exact stack — Workers, not a long-running Node server — is what
`Backend_Development_Rules.txt` rules 68–69 specify ("Database Connection
Management Must Fit the Runtime" / "Cloudflare Worker Code Must Be
Runtime-Compatible"), which is why the DB access goes through
Supabase's fetch-based REST client rather than a TCP Postgres driver.

## What I need from you before this can go live

1. **Your GitHub App's OAuth settings finished** — confirmed you're using a
   **GitHub App** (Settings → Developer settings → GitHub Apps →
   DevTunnel.tech, App ID 4767532, Client ID `Iv23liqdlxwKp3dunpZN`), not
   a classic OAuth App. Two things still need setting on that app's page:
   - **Redirect URI** (under "Identifying and authorizing users"): add
     `https://api.devtunnel.tech/auth/callback` — must match
     `GITHUB_CALLBACK_URL` below **exactly**. This was empty as of the
     last screenshot, which will make GitHub reject the callback.
   - **Account permissions → Email addresses: Read-only**. GitHub Apps
     get email access through this permission, not through an OAuth
     `scope` string (that's an OAuth-App-only concept — this backend's
     code no longer sends one). Without it, sign-in will fail for any
     user whose GitHub email is private, which is most users.
   - Leave "Request user authorization (OAuth) during installation"
     unchecked — that's for combining install + login into one step,
     which a plain "Continue with GitHub" button doesn't need.
   - Click **"Generate a new client secret"** and set it via
     `wrangler secret put` (see "Secrets" below) — never paste it here.
   - The repository permissions and webhook you've already configured
     (`https://api.devtunnel.tech/github/webhook`) are for a later
     module (repo sync) — this backend doesn't use them yet, and the
     private key isn't needed for sign-in at all.
2. **A subdomain for this API**, e.g. `api.devtunnel.tech`, pointed at
   this Worker (Cloudflare → Workers & Pages → your worker → Triggers →
   Custom Domains). It must share the apex domain (`devtunnel.tech`) with
   your frontend deployment so the `dt_session`/`dt_auth` cookies (set
   with `Domain=devtunnel.tech`) are visible to both.
3. **The `devtunnel` schema created in Supabase** — run
   `sql/001_create_schema.sql` (steps in `sql/README.md`).
4. **Your Supabase service role key** and a **random session signing
   secret** (see "Secrets" below).
5. Confirm the frontend's `NEXT_PUBLIC_API_URL` will be set to
   `https://api.devtunnel.tech` once deployed (it currently defaults to
   `http://localhost:4000` per `devtunnel-frontend/.env.example`).

## Install & local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the three secrets below
npm run dev                      # wrangler dev — http://localhost:4000 by default; pass --port if needed
```

For local dev, either run the frontend against
`NEXT_PUBLIC_API_URL=http://localhost:8787` (wrangler's default port) or
pass `--port 4000` to `wrangler dev` to match the frontend's own default.
Cookies won't have a `Domain` attribute locally (both apps on
`localhost`), so leave `COOKIE_DOMAIN` unset in `wrangler.toml`'s
`[env.dev]` if you add one, or just override it with `--var
COOKIE_DOMAIN:` when running `wrangler dev`.

## Secrets

Never put these in `wrangler.toml` (rules 6–8). Production:

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SESSION_HMAC_SECRET   # e.g. `openssl rand -hex 32`
```

Local dev: copy `.dev.vars.example` to `.dev.vars` (gitignored) and fill
in the same three values.

## Non-secret config

Edit the `[vars]` block in `wrangler.toml` directly — `GITHUB_CLIENT_ID`,
`GITHUB_CALLBACK_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`,
`SUPABASE_URL` (already filled in with the URL you gave me), `SESSION_TTL_DAYS`.

## KV namespace (rate limiting)

```bash
npx wrangler kv namespace create RATE_LIMIT_KV
npx wrangler kv namespace create RATE_LIMIT_KV --preview
```

Paste the returned `id` / `preview_id` into `wrangler.toml`.

## Deploy

```bash
npm run deploy
```

Then attach the custom domain (`api.devtunnel.tech`) in the Cloudflare
dashboard as described in step 2 above.

## Verifying it works

```bash
curl -i https://api.devtunnel.tech/health
# {"status":"ok"}

curl -i https://api.devtunnel.tech/auth/me
# 401, {"error":{"code":"unauthenticated", ...}}
```

Full sign-in has to go through a real browser (GitHub's authorize screen
requires it) — open `https://devtunnel.tech/login` once the frontend's
`NEXT_PUBLIC_API_URL` points at this backend and click "Continue with
GitHub".

## Project structure

```text
src/
  index.ts            Worker entry point — middleware + route mounting
  types.ts             Env bindings, AuthUser, DB row types
  config/env.ts         Runtime env validation (zod) — fails fast on missing config
  lib/
    supabase.ts         Supabase client, scoped to the `devtunnel` schema
    github.ts            GitHub OAuth: authorize URL, code exchange, identity fetch
    crypto.ts             Random tokens, SHA-256 hashing, HMAC sign/verify
    cookies.ts             dt_session / dt_auth / oauth-state cookie helpers
    rateLimit.ts            KV-backed fixed-window rate limiter
    response.ts               Consistent error envelope
    logger.ts                  Structured JSON logging with secret redaction
  db/
    users.ts             Upsert-by-github-id, row → AuthUser mapping
    sessions.ts            Create / validate / revoke sessions
  middleware/
    requestId.ts          Correlation ID per request
    cors.ts                 Explicit-allowlist CORS
    auth.ts                   requireAuth — for future protected routes
    errorHandler.ts             Centralized error → response mapping
  routes/
    auth.ts               POST /auth/github, GET /auth/callback, GET /auth/me, POST /auth/logout
    health.ts               GET /health
sql/
  001_create_schema.sql    devtunnel schema + users + sessions tables
  README.md                 Steps to add this schema to your existing Supabase project
```

## Notes on things I deliberately did *not* build

- **Only the auth module's tables** (`users`, `sessions`) — the rest of
  `devtunnel_schema.prisma` (`Project`, `Task`, `Contribution`, ...)
  belongs to later modules per `devtunnel_workflow.txt`; adding those
  tables now would be inventing schema for endpoints that don't exist yet
  (rule 5).
- **No Prisma** — Prisma's query engine needs either a TCP connection or
  Prisma Accelerate/Data Proxy, neither of which this task called for
  given you're already on Supabase; `@supabase/supabase-js` talks to
  Supabase directly over `fetch`, which is what Workers supports natively
  (rules 68–69).
- **`requireAuth` middleware is included but not yet mounted on any
  business route** — there aren't any non-auth routes yet. Use it as
  `app.use('/dashboard/*', requireAuth)` (or per-route) once you build
  endpoints that need a signed-in user; `c.get('user')` will have the
  `AuthUser`.
