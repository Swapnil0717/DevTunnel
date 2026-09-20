-- DevTunnel — Account settings (profile edit, notification preferences,
-- self-serve account deletion).
--
-- Backs the new `/settings/*` routes (src/routes/settings.ts):
--   PATCH /settings/profile        — name/bio edits (existing columns)
--   GET/PATCH /settings/notifications — new notification_preferences table
--   DELETE /settings/account       — soft delete, same shape as
--                                     008_add_project_soft_delete.sql
--
-- Run once, after 034_add_opensource_tool_project_link.sql.

-- ---------------------------------------------------------------------------
-- devtunnel.users — soft-delete columns
--
-- A hard DELETE would cascade into every table with a FK to users.id
-- (devtunnel.projects.created_by, devtunnel.tasks, devtunnel.submissions,
-- devtunnel.sessions, ...) and destroy contribution history that other
-- users/maintainers still need to see (Backend_Development_Rules.txt rule
-- 86 — prefer soft delete when historical visibility matters; rule 85 —
-- never destroy production data accidentally). Same pattern as
-- devtunnel.projects in 008_add_project_soft_delete.sql.
-- ---------------------------------------------------------------------------
alter table devtunnel.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_deleted_at_idx
  on devtunnel.users (deleted_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- devtunnel.notification_preferences — one row per user, created lazily
-- (the settings page defaults to sensible values when no row exists yet
-- rather than requiring a row to be pre-seeded for every existing user).
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.notification_preferences (
  user_id            uuid primary key references devtunnel.users (id) on delete cascade,
  issue_assigned     boolean not null default true,
  review_requested   boolean not null default true,
  weekly_digest      boolean not null default false,
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_notification_preferences_updated_at on devtunnel.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on devtunnel.notification_preferences
  for each row execute function devtunnel.set_updated_at();

-- ---------------------------------------------------------------------------
-- delete_own_account — the actual soft delete for `DELETE /settings/account`.
--
-- Single guarded RPC (same shape as delete_admin_project in
-- sql/008_add_project_soft_delete.sql) rather than an inline `update` in
-- application code, so the "already deleted" check and the mutation stay
-- atomic under a row lock. Does not touch devtunnel.sessions —
-- src/routes/settings.ts revokes every session for this user in the same
-- request, right after this function returns successfully, so a
-- soft-deleted account cannot keep using an existing cookie.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.delete_own_account(
  p_user_id uuid
)
returns table (id uuid, deleted_at timestamptz)
language plpgsql
as $$
declare
  v_user devtunnel.users%rowtype;
begin
  select * into v_user
  from devtunnel.users u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.deleted_at is not null then
    raise exception 'ACCOUNT_ALREADY_DELETED';
  end if;

  update devtunnel.users u
  set deleted_at = now()
  where u.id = p_user_id;

  return query
    select u.id, u.deleted_at
    from devtunnel.users u
    where u.id = p_user_id;
end;
$$;