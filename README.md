<div align="center">

<img src="./logo.png" alt="DevTunnel" width="96" />

# DevTunnel

**Pick an issue. Ship the pull request.**

DevTunnel connects contributors with open source projects. Tasks are matched to your role, level and tech stack, and a CLI opens the pull request for you.

[Website](https://devtunnel.tech) · [Browse tasks](https://devtunnel.tech/tasks) · [Projects](https://devtunnel.tech/projects) · [CLI](./devtunnel-cli) · [Contributing](./CONTRIBUTING.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

</div>

---

## Table of contents

- [What is DevTunnel?](#what-is-devtunnel)
- [How it works](#how-it-works)
- [Features](#features)
- [The `dev` CLI](#the-dev-cli)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Scheduled jobs](#scheduled-jobs)
- [Security](#security)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## What is DevTunnel?

DevTunnel is a platform that connects contributors with open source projects. Contributors find tasks that match their skills, then use the `dev` CLI to start the work and open the pull request. Everything on a contributor's profile comes from something that actually happened (a task started, a pull request opened), not from self-reported skills.

You do not need a DevTunnel task to contribute. The CLI works on **any public GitHub issue**, and the work still counts as a DevTunnel contribution.

## How it works

Every task moves through four stages. Each stage is recorded from an action, never from a box someone ticked.

| Stage | Status | Triggered by | Meaning |
|---|---|---|---|
| 1 | `OPEN` | — | A curated task nobody has claimed yet, with its role, difficulty and tech stack |
| 2 | `IN_PROGRESS` | `dev start` | You started it; the branch is named for the task |
| 3 | `IN_REVIEW` | `dev submit` | A pull request is open and linked to the task's issue |
| 4 | `DONE` | — | The task is complete |

"PR submitted" means a pull request was **opened**, not merged. A scheduled job keeps submitted pull requests in sync with GitHub (see [Scheduled jobs](#scheduled-jobs)).

There are three ways in, all using the same commands:

- **A GitHub issue** — any public repository (`dev start owner/repo#123`)
- **A DevTunnel task** — curated, with a role and difficulty (`dev start <task-id>`)
- **A whole project** — claim the project itself (`dev start <project-id> --project`)

## Features

**For contributors**

- **Projects** curated on DevTunnel, each with its description, tech stack, repository and tasks, filterable by tech.
- **Tasks** with a role, level and stack. Six roles (Frontend, Backend, Full stack, Documentation, Testing, DevOps) and three experience levels (Beginner, Intermediate, Advanced), the same ones you pick in onboarding.
- **Open source tools**, curated and filterable by language and label, each with a setup guide.
- **Live GitHub catalogs** — GitHub Projects, GitHub Open Source Tools and an All Issues view, built from live GitHub data and cached.
- **Community submissions** — projects and tools submitted by contributors, with upvotes.
- **Profile** with a contribution calendar, stats and milestones, plus settings, notification preferences and data export.
- **AI help, always labeled AI-generated** (sign-in required): AI search of the catalog in plain words, summaries of projects and tools, issue explanations (what needs doing, skills needed, difficulty, first steps) and an insights card for a repository's issues. AI output is rendered as plain text.
- **Public browsing** — projects, tools, tasks and issues are visible without signing in.

**For the platform (private admin portal)**

- Import GitHub repositories and curate projects, tasks and open source tools through step-by-step onboarding wizards.
- Review newly opened issues, sync GitHub data, and manage task status.
- An **AI Discovery** agent that proposes projects, tasks and tools for admin approval, with a budget and provider-usage panel.
- Activity audit log and bug-report inbox.

> **Boundary:** the admin portal can load and curate repository and task data, but it **cannot merge into the original GitHub repository**. Merge authority always stays with the original repository owner. DevTunnel is a coordination and discovery layer on top of GitHub, not a replacement for GitHub's permission model.

## The `dev` CLI

```bash
npm install -g @devtunnelcli/cli      # Node.js 18.18+
# or without installing:  npx @devtunnelcli/cli <command>
```

| Command | What it does |
|---|---|
| `dev login` | Sign in with GitHub in your browser and store a CLI token locally |
| `dev logout` | Revoke the token and delete the local credentials |
| `dev start <id>` | Fork and clone, then check out a working branch from the latest upstream. `<id>` is `owner/repo#123`, `owner/repo`, a github.com URL, a task id, or a project id with `--project` |
| `dev test` | Pull the latest changes and run the project's own tests (commands are read from `.github/workflows`) |
| `dev submit` | Commit, push and open the pull request, using the repository's PR template if it has one |

Typical flow:

```bash
dev login
dev start owner/repo#123
# ...make your changes...
dev test
dev submit
```

See [`devtunnel-cli/README.md`](./devtunnel-cli/README.md) for all options and how `dev login` works.

## Architecture

```
                         GITHUB
              (repos, issues, pull requests)
                            │  OAuth + REST/GraphQL
                            ▼
 ┌──────────────┐     ┌───────────────────┐     ┌───────────────────┐
 │  Frontend    │────▶│     Backend       │────▶│ Supabase Postgres │
 │  Next.js     │ API │  Hono on          │     │ (`devtunnel`      │
 │  (public +   │     │  Cloudflare       │     │  schema)          │
 │  admin)      │     │  Workers          │     └───────────────────┘
 └──────────────┘     └─────────▲─────────┘
                                │ bearer token
                         ┌──────┴──────┐
                         │ dev CLI     │
                         └─────────────┘
```

- **Frontend** (`devtunnel-frontend`) — the public site and the private admin portal in one Next.js app, deployed to Cloudflare Workers with OpenNext.
- **Backend** (`devtunnel-backend`) — a Hono API on Cloudflare Workers. Handles authentication, the project/task/tool APIs, GitHub integration, AI features, the admin API and scheduled jobs. State lives in Supabase.
- **CLI** (`devtunnel-cli`) — a Node.js command line tool that talks to the hosted API and to GitHub.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the details.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, `react-markdown` with sanitizing |
| Frontend hosting | Cloudflare Workers via `@opennextjs/cloudflare` |
| Backend | Hono, TypeScript, Zod, Cloudflare Workers |
| Database | Supabase Postgres (`@supabase/supabase-js`), own `devtunnel` schema with RLS enabled |
| Auth | GitHub sign-in (web session cookies, CLI bearer tokens) |
| CLI | Node.js ≥ 18.18, Commander, simple-git, tsup |
| AI | Pluggable OpenAI-compatible providers (Groq, Cerebras, Gemini, Mistral, OpenRouter, GitHub Models) with Cloudflare Workers AI as an optional last resort |
| Rate limiting | Cloudflare Rate Limiting bindings |

## Repository layout

```
.
├── devtunnel-frontend/   Next.js app: public site, contributor pages, admin portal
├── devtunnel-backend/    Hono API on Cloudflare Workers + Supabase SQL migrations (sql/)
├── devtunnel-cli/        The `dev` command (@devtunnelcli/cli)
├── docs/                 Product idea, detailed workflow spec, GitHub templates
├── ARCHITECTURE.md       System overview
├── ROADMAP.md            Where the project is going
├── GLOSSARY.md           DevTunnel terms
├── CONTRIBUTING.md       How to contribute
├── CODE_OF_CONDUCT.md
├── SECURITY.md           How to report a vulnerability
├── CHANGELOG.md
└── LICENSE               MIT
```

## Getting started

### Prerequisites

- Node.js 18.18 or newer and npm
- A Supabase project
- A Cloudflare account (for `wrangler`)
- A GitHub App or OAuth app for sign-in

### 1. Database

Create the schema and apply the migrations in [`devtunnel-backend/sql`](./devtunnel-backend/sql) in numeric order, then expose the `devtunnel` schema under **Project Settings → API → Exposed schemas**. Details are in [`devtunnel-backend/sql/README.md`](./devtunnel-backend/sql/README.md).

### 2. Backend

```bash
cd devtunnel-backend
npm install
cp .dev.vars.example .dev.vars   # fill in the secrets
npm run dev                      # wrangler dev (default http://localhost:8787)
```

Full setup, including the GitHub app settings and secrets, is in [`devtunnel-backend/README.md`](./devtunnel-backend/README.md).

### 3. Frontend

```bash
cd devtunnel-frontend
npm install
cp .env.example .env.local       # set NEXT_PUBLIC_API_URL to your backend
npm run dev                      # http://localhost:3000
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run preview` (Cloudflare preview), `npm run deploy`.

### 4. CLI (only if you are working on the CLI itself)

```bash
cd devtunnel-cli
npm install
npm run build
npm link                         # makes `dev` point at your local build
DEVTUNNEL_API_URL=http://localhost:8787 dev login
```

## Configuration

Secrets are never committed. In production set them with `wrangler secret put <NAME>`; locally use `devtunnel-backend/.dev.vars` (gitignored).

**Backend secrets (required)**

| Name | Purpose |
|---|---|
| `GITHUB_CLIENT_SECRET` | GitHub app client secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only, never in the frontend) |
| `SESSION_HMAC_SECRET` | Signs the OAuth state cookie (16+ characters) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Base64 32-byte key that encrypts stored GitHub tokens at rest (`openssl rand -base64 32`) |
| `GROQ_API_KEY` | AI Discovery agent |
| `GITHUB_DISCOVERY_TOKEN` | GitHub token the AI Discovery agent uses to search GitHub |

AI provider keys and model ids (Groq per-feature keys, Cerebras, Gemini, Mistral, OpenRouter, GitHub Models, Workers AI) are all optional. A provider is used only when both its key and its model are set. `AI_FEATURES_ENABLED="false"` switches every user-facing AI endpoint off.

**Backend variables** live in the `[vars]` block of `wrangler.toml` (URLs, allowed origins, cookie domain, Supabase URL and schema, session lifetime, feature flags).

**Frontend variables**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL, used for canonical links, Open Graph and the sitemap |

**CLI variable**

| Name | Default | Purpose |
|---|---|---|
| `DEVTUNNEL_API_URL` | `https://api.devtunnel.tech` | Point the CLI at a local or staging backend |

## Scheduled jobs

The backend runs five Cloudflare cron triggers, all best-effort and independent of each other.

| Schedule (UTC) | Job |
|---|---|
| `0 3 * * *` | AI Discovery agent, plus daily clean-up (expired cache rows, used CLI login codes, accounts deleted more than 30 days ago) |
| `*/15 * * * *` | Re-warms the contributor issues scan cache |
| `*/25 * * * *` | Re-warms the GitHub Projects and GitHub Open Source Tools catalogs |
| `12 * * * *` | Re-warms one GitHub Projects star-range bucket per run |
| `40 * * * *` | Syncs submitted pull requests with GitHub (task PRs and `dev submit` PRs on any repo) |

Cloudflare's Free plan allows five cron triggers per account in total.

## Security

- Web sessions use an `httpOnly`, `Secure` cookie; only the backend reads it. CLI tokens are stored hashed and expire.
- Each user's GitHub token is encrypted at rest.
- Database tables have Row Level Security enabled with no public policies; only the backend's service role reads them.
- Every admin request is authorized in the backend by an explicit permission check, not just by the frontend.
- Endpoints are rate limited, and CORS uses an explicit allowlist.

To report a vulnerability, follow [SECURITY.md](./SECURITY.md). Please do not open a public issue.

## Roadmap

The core platform is free. Paid tasks and premium infrastructure are planned and **not available yet**. The planned direction (project economy, teams, company validation, and a gradual move from rule-based matching toward data-driven approaches) is in [ROADMAP.md](./ROADMAP.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first. Contributions are accepted under the project's [MIT License](./LICENSE).

## License

DevTunnel is open source under the [MIT License](./LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense and sell copies of the software, provided the copyright and license notice are included.

DevTunnel is not affiliated with or endorsed by GitHub.

## Contact

- Website: [devtunnel.tech](https://devtunnel.tech)
- Email: [contact@devtunnel.tech](mailto:contact@devtunnel.tech)
- Issues and discussions: on this repository