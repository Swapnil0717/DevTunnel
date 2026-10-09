# devtunnel-frontend

The web app for [devtunnel.tech](https://devtunnel.tech): the public site, the signed-in contributor pages, and the private admin portal, in one Next.js application.

**Stack:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, `react-markdown` (with `rehype-sanitize`). Deployed to **Cloudflare Workers** with `@opennextjs/cloudflare`.

The frontend never talks to GitHub directly and never holds a secret. It is a client of [`devtunnel-backend`](../devtunnel-backend).

## Getting started

```bash
npm install
cp .env.example .env.local    # then set NEXT_PUBLIC_API_URL
npm run dev                   # http://localhost:3000
```

Node.js 18.18 or newer is required.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API (for local development, usually `http://localhost:8787`) |
| `NEXT_PUBLIC_SITE_URL` | Public canonical URL of this site, used for canonical links, Open Graph tags and the sitemap |

Both are public by design (`NEXT_PUBLIC_*`). Never put a secret in this app.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Build with OpenNext and preview on the Cloudflare runtime |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run upload` | Build and upload a version without deploying |
| `npm run cf-typegen` | Regenerate Cloudflare environment types |

There is no automated test suite yet. Run `npm run typecheck` and `npm run lint` before opening a pull request.

## What's in the app

| Area | Routes | Sign-in |
|---|---|---|
| Landing | `/` | No |
| Curated projects and tasks | `/projects`, `/projects/[slug]`, `/projects/[slug]/tasks/[id]`, `/tasks` | No |
| Open source tools | `/opensource-tools`, `/opensource-tools/[slug]` | No |
| Live GitHub catalogs | `/github-projects`, `/github-open-source-tools`, `/issues`, and their detail pages | No |
| Community submissions | `/submissions`, `/submissions/[slug]` | View: no. Create, edit, upvote: yes |
| Contribute pages | `.../contribute` under projects, tasks, tools and issues | Needed to start work |
| Contributor | `/home`, `/profile`, `/settings`, `/onboarding` | Yes |
| Auth | `/login`, `/auth/callback` | — |
| Legal | `/privacy`, `/terms`, `/cookies`, `/refunds`, `/contact` | No |
| Admin portal | `/admin/...` (projects, tasks, tools, new issues, AI Discovery, activity, bug reports) | Admin only |

AI features (search, summaries, issue explanations, issue insights) are labeled AI-generated, require sign-in, and render model output as plain text.

## Project structure

```
src/
  app/
    (public)/        Public pages
    (protected)/     Signed-in pages (home, profile, settings, onboarding, submissions)
    (legal)/         Privacy, terms, cookies, refunds, contact
    admin/           Admin portal (login + protected shell)
    auth/callback/   Finishes sign-in after the backend redirects back
    login/           Sign-in page
    robots.ts, sitemap.ts, layout.tsx, page.tsx
  components/        UI by area: ai, admin, auth, contribute, home, issues, landing,
                     layout, opensource-tools, profile, projects, settings,
                     submissions, tasks, ui (shared blueprint-style skeleton kit)
  lib/               Per-area API clients and types, auth, config, SEO, consent
  middleware.ts      Edge redirect for signed-in-only routes
public/              Logo, icons, Open Graph image, footer animation
layout-audit/        Playwright script that audits layouts (see its README)
```

## How authentication works

1. The "Continue with GitHub" button is a real HTML `<form method="POST">` to the backend's `/auth/github`, so sign-in works even if JavaScript fails to load.
2. GitHub redirects to the **backend's** callback, not the frontend, because exchanging the code needs the client secret.
3. The backend sets two cookies: `dt_session` (the real session, `httpOnly`, `Secure`, `SameSite=Lax`, read only by the backend) and `dt_auth` (a non-sensitive "signed in" flag), then redirects to `/auth/callback`.
4. Protection has two layers:
   - `middleware.ts` (Edge) redirects signed-out visitors away from signed-in routes using the `dt_auth` flag. A fast UX check only.
   - Server components verify the session against the backend's `GET /auth/me` before rendering. The backend independently authorizes every API request.

Admin routes use the same approach with a separate login and an admin-role check in the backend.

## SEO

Public pages set a unique title, description, canonical URL and Open Graph tags through `src/lib/seo.ts`, with JSON-LD where useful. Signed-in, admin and auth pages are `noindex`, and `robots.ts` disallows them. `sitemap.ts` lists only public pages.

## Layout audit

`layout-audit/` holds a Playwright script that checks pages for layout problems on the live site or a local build. See [`layout-audit/README.md`](./layout-audit/README.md).

## Deploying

The app is built with OpenNext and deployed as a Cloudflare Worker (`wrangler.jsonc`). Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` for your environment before building, since `NEXT_PUBLIC_*` values are inlined at build time. If you self-host, serve the frontend and backend from the same apex domain so the session cookies are shared.