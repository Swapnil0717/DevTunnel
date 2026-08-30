# DevTunnel — Frontend (Authentication module)

This is the frontend for DevTunnel's **Authentication** module (Module C1 in
`devtunnel_workflow.txt`), covering:

- [x] Login page
- [x] GitHub login button
- [x] OAuth callback handling
- [x] Authentication state
- [x] Protected-route handling
- [x] Logout functionality
- [x] User profile state

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS**. Next.js
was chosen over a plain client-side SPA because `Frontend_Development_Rules.txt`
requires real URLs, server-rendered content, and per-page SEO metadata for
public pages — all of which Next.js's App Router provides natively (file
routing, Server Components, the `Metadata`/`robots`/`sitemap` APIs) rather
than needing to be bolted on.

Only the frontend is implemented here. No backend/API code is included —
this app is a client of the DevTunnel backend described in
`devtunnel_workflow.txt` and `devtunnel_schema.prisma`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in NEXT_PUBLIC_API_URL
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the DevTunnel backend API (e.g. `http://localhost:4000`). |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL of this frontend, used for canonical links, Open Graph tags, and the sitemap. |

## Project structure

```
src/
  app/
    layout.tsx              Root layout — fonts, global metadata, mounts AuthProvider
    page.tsx                Public homepage
    not-found.tsx            404 page
    robots.ts / sitemap.ts   Dynamic SEO endpoints
    login/page.tsx           Login screen
    auth/callback/page.tsx   OAuth callback screen
    (protected)/
      layout.tsx             Server-side session gate for authenticated routes
      dashboard/page.tsx
      profile/page.tsx
  components/
    auth/                    GithubLoginButton, LoginCard, AuthStatusPanel,
                             OAuthCallbackView, LogoutButton, WindowChrome
    layout/                  Logo, AppHeader
    ui/                      StatusDot
  lib/
    auth/                    types, api client, cookie contract, AuthProvider, useAuth
    config.ts                Env-driven site config (single source of truth)
    seo.ts                   Centralized metadata builder (title/description/canonical/OG/robots)
  middleware.ts               Edge-level protected-route redirect
```

## Auth architecture

### API contract (from `devtunnel_workflow.txt`, Module C1)

```
POST /auth/github    starts the GitHub OAuth flow
GET  /auth/callback  backend-only — receives the GitHub `code`, never called by the browser
GET  /auth/me        returns { user } for the current session, or 401
POST /auth/logout    clears the session
```

### Documented assumptions

The backend isn't part of this deliverable, so the following contract is
assumed and called out in code comments (`lib/auth/session.ts`,
`components/auth/oauth-callback-view.tsx`) so it's easy to correct once the
real backend exists:

1. **Starting sign-in** — the "Continue with GitHub" button is a real HTML
   `<form method="POST" action="{API_URL}/auth/github">`, not a JS
   `onClick`. This means sign-in still works if JavaScript fails to load,
   per rule 38 of `Frontend_Development_Rules.txt`. The backend responds
   with a redirect into GitHub's OAuth authorize screen.
2. **Finishing sign-in** — GitHub's OAuth app callback URL points at the
   **backend's** `GET /auth/callback`, not the frontend, because exchanging
   the authorization code for a token requires the OAuth client secret,
   which must never live in frontend code (rule 19). The backend performs
   that exchange, starts the session, and redirects the browser to this
   frontend's `/auth/callback?status=success&next=...` (or
   `?status=error&reason=...`), which finishes the client-side handoff.
3. **Session cookies** — the backend sets two cookies:
   - `dt_session` — the real session token. `httpOnly`, `Secure`,
     `SameSite=Lax`. Only the backend ever reads it.
   - `dt_auth` — a small, non-sensitive "am I logged in" flag (e.g. `"1"`),
     not `httpOnly`, with the same lifetime as the session. It carries no
     identity data and exists purely so the Edge middleware can redirect
     quickly without a network call.

   The flag cookie is a UX optimization only — every protected route is
   re-verified server-side against `GET /auth/me` before rendering (see
   `(protected)/layout.tsx`), and the backend must independently authorize
   every request regardless of what the frontend believes.

### Two layers of route protection

1. **`middleware.ts`** (Edge) — fast redirect to `/login` based on the
   `dt_auth` flag cookie, before any page code runs.
2. **`(protected)/layout.tsx`** (Server Component) — the real check. It
   forwards the request's cookies to `GET /auth/me` and only renders the
   page if the backend confirms a valid session; otherwise it redirects.

### Authentication + profile state

`lib/auth/auth-provider.tsx` exposes a React context (`useAuth()`) with:

```ts
{
  user: AuthUser | null,   // id, email, username, name, bio, avatarUrl,
                            // githubUsername, githubProfileUrl, role, timestamps
                            // — the frontend-safe subset of `model User`
                            // in devtunnel_schema.prisma
  status: "loading" | "authenticated" | "unauthenticated",
  refreshUser: () => Promise<void>,
  logout: () => Promise<void>,
}
```

It's mounted once in the root layout so any page can read sign-in state
(e.g. to show/hide a nav avatar). This context is a UI convenience layer,
not the security boundary — see "Two layers of route protection" above.

## Design

Colors, spacing, and the window-chrome/status-panel treatment in
`/login` and `/auth/callback` are lifted directly from the provided
`1_devtunnel_login_page.html` reference and centralized as Tailwind design
tokens (`tailwind.config.ts`) so every screen shares one palette. The
`AuthStatusPanel` reflects the page's *real* current state (idle, loading,
or error) rather than showing all three states at once as static copy.

The provided `logo.png` contained an unused white artifact layer alongside
the green mark, so it was re-exported as two clean assets:
`public/logo-mark.png` (the mark alone, transparent background, used by the
`Logo` component next to the wordmark) and `public/logo.png` (a larger
version of the same mark, used as the favicon/OG image). The "DevTunnel"
wordmark itself stays real text everywhere — never baked into an image —
per rule 22; only the graphic mark is an `<Image>`.

The reference login page's fake browser-window chrome (traffic-light dots +
fake URL bar) was a mockup device for presenting the design, not a real UI
element, so it isn't part of the shipped `/login` page.

## SEO & crawlability notes

- `/login`, `/auth/callback`, `/dashboard`, and `/profile` are all
  authenticated/application UI, not public content — each sets
  `robots: noindex` via `lib/seo.ts` and is disallowed in `robots.ts`
  (rule 18).
- The public homepage (`/`) has a unique title, description, canonical URL,
  Open Graph tags, one `<h1>`, and a real crawlable `<a href="/login">`
  link into the auth flow, so `/login` isn't an orphan page (rule 11) even
  though it's itself not indexed.
- `sitemap.ts` only lists genuinely public pages. As public content (docs,
  project pages, developer profiles, ...) is built, it should register
  itself there — never the private auth/app-shell routes.

## Scope note

Per the brief, this pass covers **authentication only**. Project discovery,
task management, and the admin portal from `devtunnel_workflow.txt` are out
of scope here — `/dashboard` is a minimal placeholder that proves the
protected-route + auth-state wiring works end to end.
