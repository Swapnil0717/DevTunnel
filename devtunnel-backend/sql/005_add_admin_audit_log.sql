-- DevTunnel — Admin audit log (Admin Backend module)
--
-- Backs `GET /admin/activity` (devtunnel_workflow.txt section 43 — Admin
-- Backend routes) and Backend_Development_Rules.txt rule 96 ("Audit
-- important administrative actions"). Every row is written by
-- devtunnel-backend/src/middleware/adminAuth.ts (denied admin-role /
-- permission checks) and, in later modules, by whichever admin route
-- performs a state-changing action (project publish, author edit, etc.)
-- via devtunnel-backend/src/db/adminAudit.ts. Run once, after
-- 004_add_devtunnel_contributions.sql.

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_audit_result' and typnamespace = 'devtunnel'::regnamespace) then
    create type devtunnel.admin_audit_result as enum ('SUCCESS', 'DENIED', 'FAILURE');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- admin_audit_log — append-only. Nothing in this codebase ever updates or
-- deletes a row here; it is a record of what happened, not current state.
-- `admin_id` is `not null` because every write site (adminAuth.ts,
-- future admin route handlers) only ever runs after `requireAuth` has
-- resolved a real signed-in user — there is no "anonymous admin action".
-- `metadata` must never contain secrets or raw tokens (rule 59) — callers
-- are responsible for passing only already-safe values, same discipline
-- as src/lib/logger.ts's redact().
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references devtunnel.users (id) on delete cascade,
  action         text not null,
  resource_type  text not null,
  resource_id    text,
  result         devtunnel.admin_audit_result not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_id_idx on devtunnel.admin_audit_log (admin_id);
-- Supports the keyset-paginated `ORDER BY created_at DESC` in
-- src/db/adminAudit.ts (listAdminAuditLog) without a table scan as this
-- table grows without bound.
create index if not exists admin_audit_log_created_at_idx on devtunnel.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Access control — same defense-in-depth posture as 001_create_schema.sql:
-- this backend talks to Supabase exclusively with the service role key
-- (src/lib/supabase.ts), which bypasses RLS by design. RLS is enabled
-- anyway with zero policies so anon/authenticated clients get no access
-- even if `devtunnel` is ever exposed in the API settings.
-- ---------------------------------------------------------------------------
alter table devtunnel.admin_audit_log enable row level security;
revoke all on devtunnel.admin_audit_log from anon, authenticated;