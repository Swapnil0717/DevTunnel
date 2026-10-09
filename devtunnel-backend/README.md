# devtunnel-backend

The API behind [devtunnel.tech](https://devtunnel.tech): authentication, the project, task and tool APIs, GitHub integration, AI features, the admin API and scheduled jobs.

**Stack:** [Hono](https://hono.dev) on **Cloudflare Workers**, **Supabase Postgres** (via `@supabase/supabase-js`, service role key, its own `devtunnel` schema), **GitHub** sign-in, **Zod** for config validation.

It runs on Workers, so database access goes through Supabase's fetch-based REST client rather than a TCP Postgres driver, and all code must be Workers-compatible.

## Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Secrets](#secrets)
- [Configuration](#configuration)
- [Run, test and deploy](#run-test-and-deploy)
- [API overview](#api-overview)
- [Scheduled jobs](#scheduled-jobs)
- [Project structure](#project-structure)

## Prerequisites

- Node.js 18.18+ and npm
- A Supabase project
- A Cloudflare account with Workers
- A GitHub App (or OAuth app) for sign-in

## Setup

### 1. Database

Follow [`sql/README.md`](./sql/README.md): create the `devtunnel` schema, apply every migration in `sql/` in numeric order, and add `devtunnel` to the exposed schemas.

### 2. GitHub app

In GitHub → Settings → Developer settings, register the app and configure:

- **Callback URLs** (both must match the Worker variables exactly):
  - `https://<your-api-domain>/auth/callback` (web sign-in, `GITHUB_CALLBACK_URL`)
  - `https://<your-api-domain>/auth/cli/callback` (`dev login`, `GITHUB_CLI_CALLBACK_URL`). See [`CLI_AUTH_SETUP.md`](./CLI_AUTH_SETUP.md).
- **Account permissions → Email addresses: Read-only**, so sign-in works for users with a private email. GitHub Apps get email access through this permission, not an OAuth scope.
- Leave "Request user authorization (OAuth) during installation" unchecked.
- Generate a client secret and set it as a secret (below). Never commit it.

### 3. API domain

Serve the Worker from a subdomain of the same apex domain as the frontend (for example `api.example.com` with the frontend on `example.com`), so the `dt_session` and `dt_auth` cookies, set with `Domain=<apex>`, are visible to both. In Cloudflare: Workers & Pages → your worker → Triggers → Custom Domains.

### 4. Install and configure

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the secrets below
```

Then edit the `[vars]` block of `wrangler.toml` for your environment (see [Configuration](#configuration)).

The committed `wrangler.toml` contains the production values for devtunnel.tech (URLs, Supabase project URL, GitHub client id, KV and rate-limit namespace ids). When self-hosting, replace all of them with your own. Rate-limit `namespace_id` values must be unique across your whole Cloudflare account.

## Secrets

Never put these in `wrangler.toml`. In production:

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SESSION_HMAC_SECRET            # openssl rand -hex 32
npx wrangler secret put GITHUB_TOKEN_ENCRYPTION_KEY    # openssl rand -base64 32 (32 bytes)
npx wrangler secret put GROQ_API_KEY                   # AI Discovery agent
npx wrangler secret put GITHUB_DISCOVERY_TOKEN         # GitHub token for AI Discovery searches
```

Locally, put the same names in `.dev.vars` (gitignored). The first four also appear in `.dev.vars.example`.

`GITHUB_TOKEN_ENCRYPTION_KEY` encrypts each user's stored GitHub token at rest. Rotating it means users have to sign in again.

### Optional AI secrets

User-facing AI features work with any configured provider. A provider is used only when both its key and its model variable are set.

| Secret | Used for |
|---|---|
| `GROQ_API_KEY_SEARCH`, `_SUMMARY`, `_EXPLAIN`, `_INSIGHTS` | One Groq key per feature (search bar, summaries, issue explanations, insights) |
| `GROQ_API_KEY_BACKUP`, `GROQ_API_KEY_2` | Shared Groq backups any feature falls back to |
| `CEREBRAS_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_MODELS_TOKEN` | Backup providers |

Groq limits apply per organization, not per key. For separate budgets, create keys in different Groq accounts. Cloudflare Workers AI is an optional last resort: uncomment the `[ai]` binding in `wrangler.toml` (it needs no secret).

## Configuration

Non-secret configuration lives in the `[vars]` block of `wrangler.toml` (and `[env.staging.vars]` for staging).

| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | `production`, `staging` or `development` |
| `GITHUB_CLIENT_ID` | GitHub app client id (public) |
| `GITHUB_CALLBACK_URL`, `GITHUB_CLI_CALLBACK_URL` | Web and CLI sign-in callbacks |
| `FRONTEND_URL` | Where the browser is sent after sign-in; default CORS origin |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (no wildcards) |
| `COOKIE_DOMAIN` | Apex domain for the session cookies. Leave unset for localhost |
| `SUPABASE_URL`, `SUPABASE_DB_SCHEMA` | Supabase project URL and schema (`devtunnel`) |
| `SESSION_TTL_DAYS` | How long a web session lasts |
| `GROQ_MODEL` | Model for the AI Discovery agent |
| `AI_FEATURES_ENABLED` | `"false"` switches off every user-facing AI endpoint |
| `GROQ_SEARCH_MODEL`, `GROQ_SECONDARY_MODEL`, `CEREBRAS_MODEL`, `GEMINI_MODEL`, `MISTRAL_MODEL`, `OPENROUTER_MODEL`, `GITHUB_MODELS_MODEL`, `CF_AI_MODEL` | Model ids per provider; leave blank to disable that provider |
| `USE_SUPABASE_CACHE`, `USE_SUPABASE_LOCKS`, `USE_SUPABASE_CLI_CODES`, `USE_RATE_LIMIT_BINDING`, `KV_READ_FALLBACK` | Feature flags for the move off Workers KV writes. Anything except `"false"` means on. Each is an instant rollback for its own part |

### KV namespace (legacy, read-only)

The Worker no longer writes to Workers KV. The `RATE_LIMIT_KV` binding is kept so a cold cache can be seeded from old entries and for the rollback flags. Create your own if you want it:

```bash
npx wrangler kv namespace create RATE_LIMIT_KV
npx wrangler kv namespace create RATE_LIMIT_KV --preview
```

and paste the ids into `wrangler.toml`.

## Run, test and deploy

```bash
npm run dev         # wrangler dev (default http://localhost:8787, or pass --port 4000)
npm run typecheck   # tsc --noEmit
npm run deploy      # wrangler deploy
npm run tail        # live logs
```

There is no automated test suite yet; run `npm run typecheck` before opening a pull request.

For local development, point the frontend at the Worker with `NEXT_PUBLIC_API_URL=http://localhost:8787` (or run `wrangler dev --port 4000` to match the frontend's older default). Both apps are on `localhost`, so leave `COOKIE_DOMAIN` unset locally (or override it with `--var COOKIE_DOMAIN:`).

Check that it is up:

```bash
curl -i http://localhost:8787/health
# {"status":"ok"}

curl -i http://localhost:8787/auth/me
# 401  {"error":{"code":"unauthenticated", ...}}
```

Full sign-in has to go through a real browser, because GitHub's authorize screen requires it.

Deploy to staging with `npx wrangler deploy --env staging`.

## API overview

All routes return JSON with a consistent error envelope, carry a request id, and are rate limited. `optionalAuth` routes work signed out; `requireAuth` routes need a session cookie or a CLI bearer token.

| Area | Routes |
|---|---|
| Health | `GET /health` |
| Web auth | `POST /auth/github`, `GET /auth/callback`, `GET /auth/me`, `PATCH /auth/onboarding`, `POST /auth/logout` |
| CLI auth | `GET /auth/cli/start`, `GET /auth/cli/callback`, `POST /auth/cli/token`, `POST /auth/cli/logout` |
| Projects | `GET /projects/available`, `GET /projects/:slug`, `GET /projects/:slug/issues`, `PUT`/`DELETE /projects/:slug/star`, `POST /projects/:slug/contribute`, `POST /projects/:id/start`, `POST /projects/:id/submit`, `POST /projects/ai-search` |
| Tasks | `GET /tasks`, `GET /projects/:projectSlug/tasks/:taskId`, `GET /users/me/tasks`, `GET /users/me/recommended-tasks`, `POST /tasks/:id/start`, `POST /tasks/:id/submit`, `POST /tasks/:id/view`, `POST /tasks/:id/feedback` |
| Open source tools | `GET /opensource-tools/available`, `GET /opensource-tools/:slug`, `GET /opensource-tools/:slug/issues`, `PUT`/`DELETE /opensource-tools/:slug/star`, `POST /opensource-tools/:slug/contribute`, `POST /opensource-tools/ai-search` |
| Contribute progress | `GET /projects/:slug/contribute`, `PUT /projects/:slug/contribute/progress`, and the same two under `/opensource-tools/:slug/` |
| GitHub catalogs | `GET /github-projects`, `/github-projects/:slug`, `/github-projects/:slug/issues`, `POST /github-projects/ai-search`, `/refresh`, `/:slug/request-onboarding`, `/:slug/contribute`, star routes; the same set under `/github-open-source-tools` |
| Issues | `GET /issues`, `GET /issues/:projectSlug/:issueNumber` |
| Any GitHub repo | `POST /github/start`, `POST /github/submit` (what `dev start` and `dev submit` call for `owner/repo#123`) |
| Submissions | `GET /submissions`, `GET /submissions/:slug`, draft routes under `/submissions/draft/*`, `PUT`/`DELETE /submissions/:slug`, `PUT`/`DELETE /submissions/:slug/upvote` |
| Profile and settings | `GET /users/me/contributions[/summary]`, `/users/me/contributions/devtunnel[/summary]`, `/users/me/contributions/milestones`, `/users/me/devtunnel-stats`, `/users/me/activity`, `/users/me/profile-activity`, `PATCH /settings/profile`, `/settings/skills`, `GET`/`PATCH /settings/notifications`, `GET /settings/export`, `DELETE /settings/account` |
| AI (signed in) | `POST /ai/summary`, `POST /ai/issue-explanation`, `POST /ai/issue-insights` |
| Bug reports | `POST /bug-reports` (open to signed-out visitors, rate limited per IP) |
| Admin | everything under `/admin`: `/auth`, `/activity`, `/projects`, `/projects/onboarding`, `/tasks`, `/tasks/onboarding`, `/opensource-tools`, `/opensource-tools/onboarding`, `/new-issues`, `/ai`, `/bug-reports` |

Admin routes require an admin role **and** a specific permission per route (`src/lib/rbac.ts`). The frontend hiding a button is never the authorization.

## Scheduled jobs

Five cron triggers are declared in `wrangler.toml`; `src/index.ts` tells them apart by `event.cron`.

| Cron (UTC) | Job |
|---|---|
| `0 3 * * *` | AI Discovery agent, purge of expired cache rows and used CLI login codes, purge of accounts deleted more than 30 days ago |
| `*/15 * * * *` | Re-warm the contributor issues scan cache |
| `*/25 * * * *` | Re-warm the GitHub Projects and Open Source Tools catalogs |
| `12 * * * *` | Re-warm one star-range bucket of the GitHub Projects catalog per run |
| `40 * * * *` | Sync submitted pull requests with GitHub |

They are independent and best-effort. The Free plan allows five cron triggers per account in total.

## Project structure

```text
src/
  index.ts            Worker entry: middleware, route mounting, cron handler
  types.ts            Env bindings and row types
  config/env.ts       Zod validation of the environment; fails fast
  routes/             HTTP routes (public, contributor, AI, auth, admin/)
  db/                 Supabase access, one module per area
  lib/
    ai/               Provider adapter, fallback chain, prompts, usage tracking
    github*.ts        GitHub REST/GraphQL clients, catalog, forks, pull requests
    cache*.ts         Isolate memory + Cache API + Supabase cache with SWR
    rateLimit.ts      Cloudflare Rate Limiting bindings
    crypto.ts         Hashing, HMAC, token encryption
    rbac.ts           Role-to-permission map for admin routes
    prSync.ts         Hourly pull request sync
  middleware/         requestId, cors, auth, adminAuth, errorHandler
sql/                  Numbered migrations (001 ... 052) and sql/README.md
```