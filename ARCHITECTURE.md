# DevTunnel — Architecture

This document describes how DevTunnel is built today. For the original product vision and the long-form module specs, see [`docs/devtunnel-idea.md`](./docs/devtunnel-idea.md) and [`docs/devtunnel-workflow.md`](./docs/devtunnel-workflow.md). Those are design documents: they describe the planned scope, which is larger than what is built.

## Overview

```
                              GITHUB
                (repositories, issues, pull requests)
                                │  sign-in, REST and GraphQL APIs
                                ▼
 ┌─────────────────────┐   HTTPS    ┌────────────────────────┐   service role   ┌──────────────────┐
 │ devtunnel-frontend  │──────────▶│   devtunnel-backend    │────────────────▶│ Supabase Postgres│
 │ Next.js on          │  cookies   │   Hono on Cloudflare   │                  │ schema:          │
 │ Cloudflare Workers  │            │   Workers + cron       │                  │ `devtunnel`      │
 │ public site + admin │            └───────────▲────────────┘                  └──────────────────┘
 └─────────────────────┘                        │ bearer token
                                       ┌────────┴────────┐
                                       │  devtunnel-cli  │  (`dev` command, also talks to GitHub)
                                       └─────────────────┘
```

All state lives in Supabase. The backend holds no long-running process and no local disk; every request and cron run is a stateless Worker invocation.

## Components

### Frontend (`devtunnel-frontend`)

A single Next.js 15 App Router application, deployed to Cloudflare Workers through `@opennextjs/cloudflare`.

- **Public pages** (no sign-in): home, projects, tasks, open source tools, community submissions, GitHub catalogs, issues, and the legal pages. Page data is fetched from the backend.
- **Signed-in pages**: home dashboard, profile, settings, onboarding, and creating or editing a submission.
- **Contribute pages**: each project, task, tool and issue has a `/contribute` page that shows the exact CLI commands and tracks progress.
- **Admin portal** under `/admin`: projects, tasks, open source tools, new issues, the AI Discovery queue, activity log and bug reports.
- Edge `middleware.ts` redirects signed-out visitors away from signed-in routes using a non-sensitive `dt_auth` flag cookie. This is a convenience only; the real check is the backend, which verifies the session on every request.
- Markdown from GitHub and from AI output is sanitized before rendering.

### Backend (`devtunnel-backend`)

A Hono application on Cloudflare Workers.

```
src/
  index.ts          Worker entry: middleware, route mounting, cron handler
  config/env.ts     Zod validation of bindings; fails fast on missing config
  routes/           HTTP routes (public, contributor, AI, auth, admin/)
  db/               Supabase queries, one module per area
  lib/              GitHub clients, AI chain, caching, rate limiting, crypto, cron jobs
  middleware/       request id, CORS allowlist, auth, admin auth, error handler
sql/                Numbered migrations for the `devtunnel` schema
```

Key design points:

- **Runtime-compatible data access.** Postgres is reached through Supabase's fetch-based client, not a TCP driver, because Workers do not hold database connections.
- **Authorization lives in the backend.** `requireAuth` protects contributor routes. Admin routes go through `adminAuth` and a permission check (`src/lib/rbac.ts`), where each route declares the permission it needs.
- **No Workers KV writes on hot paths.** Rate limiting uses Cloudflare Rate Limiting bindings. Caches use isolate memory, the Cache API and a Supabase `cache_entries` table. Scan locks and CLI login codes live in Supabase. The old KV namespace is kept read-only as a fallback, and feature flags in `wrangler.toml` allow each replacement to be rolled back.
- **Stale-while-revalidate caches** keep GitHub-backed pages fast. Cron jobs warm them so a contributor's page load rarely waits on a live GitHub scan.
- **Structured logging** with secret redaction, and a request id on every request.

### CLI (`devtunnel-cli`)

A Node.js program published as `@devtunnelcli/cli`, installed as `dev`.

- `dev login` uses a loopback OAuth flow with a PKCE-style verifier and challenge, and stores a long-lived token in `~/.devtunnel/credentials.json` (mode `0600`).
- `dev start` forks the repository and checks out a branch from the upstream default branch. `dev submit` commits, pushes and asks the backend to open the pull request with the contributor's own GitHub token.
- `dev test` reads install, lint, typecheck, test and build commands from the repository's `.github/workflows`, skipping steps that publish, deploy, use secrets or use `sudo`.

## Key flows

### Web sign-in

1. The browser submits a form to `POST /auth/github`; the backend redirects to GitHub.
2. GitHub redirects to the backend's `GET /auth/callback`, which exchanges the code (the client secret never reaches the browser), upserts the user, encrypts and stores the GitHub token, and creates a session.
3. The backend sets an `httpOnly` `dt_session` cookie and a readable `dt_auth` flag cookie, then redirects to the frontend.

### CLI sign-in

See [`devtunnel-cli/README.md`](./devtunnel-cli/README.md#how-dev-login-works) and [`devtunnel-backend/CLI_AUTH_SETUP.md`](./devtunnel-backend/CLI_AUTH_SETUP.md). The CLI flow uses a separate callback URL and never touches the web cookies.

### Task lifecycle

```
OPEN ──dev start──▶ IN_PROGRESS ──dev submit──▶ IN_REVIEW ──▶ DONE
```

`dev start` claims the task and records the fork and branch. `dev submit` opens the pull request server-side and records it against the task. An hourly job syncs submitted pull requests with GitHub. Starting or submitting on an arbitrary public GitHub issue (`POST /github/start`, `POST /github/submit`) records an external contribution that counts toward the contributor's profile.

### AI features

All user-facing AI features are optional, signed-in only, and **stored-first**: if a summary, explanation or insight already exists and is fresh, it is returned from Supabase with no model call.

- **Provider chain** (`src/lib/ai/chain.ts`): each job tries its own key first, then shared backups, then other configured providers. A provider with no key or no model is skipped.
- **Providers** all speak the OpenAI chat-completions dialect through one adapter. Cloudflare Workers AI is an optional last resort.
- **Untrusted input**: repository text sent to a model is treated as untrusted, and model output is rendered as plain text and labeled AI-generated.
- **Usage tracking** feeds the admin AI budget and provider-usage panels.
- **AI Discovery agent** runs daily and on demand from the admin portal. It proposes projects, tasks and tools into an admin approval queue; nothing is published without approval.

## Access and permission boundaries

DevTunnel's admin layer curates and publishes data, but never gains write or merge access to a contributor's or repository owner's GitHub repository.

```
DevTunnel admin
   ↓ load repository + tasks, curate, publish on DevTunnel
   ✗ cannot merge into the original repository

Original repository owner
   ↓ reviews contributor pull requests
   ↓ merges on GitHub directly
```

Pull requests are opened with the contributor's own GitHub token, on their own fork.

## Data

Migrations in `devtunnel-backend/sql/` define everything under the `devtunnel` Postgres schema, including users, sessions, CLI tokens, projects, tasks, open source tools, onboarding drafts, contributions and progress, submissions, AI usage and summaries, the admin audit log and bug reports. Every table has Row Level Security enabled with no policies for `anon` or `authenticated`; only the backend's service role reads and writes.

## Design principle for matching

Matching, scoring and recommendations start as simple, deterministic and explainable rules, and are meant to become more data-driven as real contribution history accumulates. See [ROADMAP.md](./ROADMAP.md).

## Related documents

- [`docs/devtunnel-idea.md`](./docs/devtunnel-idea.md): product vision and phased plan
- [`docs/devtunnel-workflow.md`](./docs/devtunnel-workflow.md): original module-by-module design spec
- [`ROADMAP.md`](./ROADMAP.md): planned direction
- [`GLOSSARY.md`](./GLOSSARY.md): DevTunnel terms