# Adding the DevTunnel auth schema to your existing Supabase project

Your Supabase project (`bdxnvouuyfjryuncxkfx`) already stores your wishlist
app's data, almost certainly in the default `public` schema. Rather than
mixing DevTunnel's `users` / `sessions` tables into `public` — where a
table name collision or an accidental broad query could touch the wrong
app's data — this backend uses its own **Postgres schema**, `devtunnel`,
inside the *same* project. One project, two isolated namespaces, no shared
tables, no risk to your wishlist data.

## 1. Run the migration

Supabase Dashboard → your project → **SQL Editor** → paste the contents of
`001_create_schema.sql` → **Run**.

This creates:

- `devtunnel` schema
- `devtunnel.user_role` enum
- `devtunnel.users` table
- `devtunnel.sessions` table
- RLS enabled with no grants to `anon`/`authenticated` (defense in depth —
  see below)

It does **not** touch `public` or anything already in it. Your wishlist
tables are unaffected.

## 2. (Only if you also plan to query these tables via the Supabase JS/REST
client from somewhere *other* than this backend)

This backend talks to Postgres through `@supabase/supabase-js`, which goes
over Supabase's PostgREST API. PostgREST only serves schemas that are
explicitly exposed:

Dashboard → **Project Settings** → **API** → **Exposed schemas** → add
`devtunnel` alongside `public` → Save.

If nothing outside this Worker will ever query `devtunnel.*` directly (the
recommended setup — this backend is the only thing that talks to these
tables), you can skip this step. The backend still works either way
because it authenticates with the **service role key**, which PostgREST
honors regardless of the exposed-schemas allowlist for direct
`schema('devtunnel')` calls made server-side... but exposing it explicitly
is required for the `db: { schema: 'devtunnel' }` option in
`src/lib/supabase.ts` to resolve correctly, so **do this step** — it's not
optional for this backend to function, only optional for outside
consumers.

## 3. Get your service role key

Dashboard → **Project Settings** → **API** → **Project API keys** →
`service_role` (labelled "secret"). This is *not* the same as the
`anon`/`public` key your wishlist frontend presumably already uses.

**Never** put this key in frontend code, a `NEXT_PUBLIC_*` env var, or
anywhere in the `devtunnel-frontend` project — only this backend's secret
bindings should ever hold it (see main README.md, "Secrets").

## 4. Why RLS is enabled with zero policies

`devtunnel.users` and `devtunnel.sessions` have Row Level Security turned
on, but no policies are defined, and `anon`/`authenticated` have had all
privileges explicitly revoked. That means:

- The service role key (used only by this Worker) bypasses RLS entirely,
  as intended — this backend does its own authorization in code.
- Any other client — including your wishlist app's Supabase client, if it
  ever runs in the same browser session as DevTunnel — gets **zero**
  access to these tables, even by accident, even if `devtunnel` ends up
  exposed in the API settings.

## 5. Future modules

`devtunnel_schema.prisma` describes many more tables (`Project`, `Task`,
`Contribution`, `PullRequest`, ...) for modules beyond authentication.
Add those with a new `sql/002_*.sql` migration in the same `devtunnel`
schema when you build those backend routes — this keeps every DevTunnel
table together and still fully separate from your wishlist app's tables.
