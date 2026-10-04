-- DevTunnel — permanent purge of deleted accounts (privacy / data retention).
--
-- `DELETE /settings/account` only soft-deletes (sql/035): it sets
-- devtunnel.users.deleted_at and the route revokes every session. This
-- migration adds the second half, so deleted accounts don't keep personal data
-- forever: after a grace period (default 30 days) the daily 03:00 UTC cron
-- (src/index.ts -> src/db/accountData.ts `purgeDeletedAccounts`) calls
-- `devtunnel.purge_deleted_accounts()`, which
--
--   1. DELETES the account's personal rows: sessions, CLI tokens/codes,
--      notification preferences, task views, repo-contribution records, stars,
--      project/tool memberships, contribution progress, feedback, external
--      contributions, submission upvotes and drafts, and the activity log;
--   2. ANONYMISES the devtunnel.users row in place (it is NOT hard-deleted:
--      projects, tasks, pull requests and published submissions still point at
--      it, and one FK is `on delete restrict`). Email, username, name, bio,
--      avatar, GitHub identity, encrypted GitHub tokens, skills, roles and
--      interests are wiped. The GitHub ID is replaced, so signing in with the
--      same GitHub account afterwards creates a brand-new, empty account.
--
-- Safe to re-run: purged rows are recognised by `github_id like 'purged-%'` and
-- skipped. An account that signed in again after deleting (last_login_at later
-- than deleted_at) is never purged. Tables from migrations you haven't run are
-- skipped, not an error.
--
-- Run once, after 051_drop_sponsors.sql.

-- Deletes `p_col = any(p_ids)` rows from devtunnel.<p_table> when it exists.
create or replace function devtunnel._purge_user_rows(
  p_table text,
  p_col   text,
  p_ids   uuid[]
)
returns void
language plpgsql
as $$
begin
  if to_regclass(format('devtunnel.%I', p_table)) is null then
    return;
  end if;
  execute format('delete from devtunnel.%I where %I = any($1)', p_table, p_col)
    using p_ids;
end;
$$;

create or replace function devtunnel.purge_deleted_accounts(
  p_grace_days integer default 30,
  p_limit      integer default 50
)
returns integer
language plpgsql
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(t.id), '{}')
    into v_ids
  from (
    select u.id
    from devtunnel.users u
    where u.deleted_at is not null
      and u.deleted_at < now() - make_interval(days => greatest(p_grace_days, 0))
      and u.github_id not like 'purged-%'
      and (u.last_login_at is null or u.last_login_at <= u.deleted_at)
    order by u.deleted_at
    limit greatest(p_limit, 1)
  ) t;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  -- 1) personal rows
  perform devtunnel._purge_user_rows('sessions',                     'user_id',      v_ids);
  perform devtunnel._purge_user_rows('cli_tokens',                   'user_id',      v_ids);
  perform devtunnel._purge_user_rows('cli_auth_codes',               'user_id',      v_ids);
  perform devtunnel._purge_user_rows('notification_preferences',     'user_id',      v_ids);
  perform devtunnel._purge_user_rows('task_views',                   'user_id',      v_ids);
  perform devtunnel._purge_user_rows('github_repo_contributors',     'user_id',      v_ids);
  perform devtunnel._purge_user_rows('github_stars',                 'starred_by',   v_ids);
  perform devtunnel._purge_user_rows('project_contributors',         'user_id',      v_ids);
  perform devtunnel._purge_user_rows('opensource_tool_contributors', 'user_id',      v_ids);
  perform devtunnel._purge_user_rows('contribution_progress',        'user_id',      v_ids);
  perform devtunnel._purge_user_rows('contribution_feedback',        'user_id',      v_ids);
  perform devtunnel._purge_user_rows('external_contributions',       'user_id',      v_ids);
  perform devtunnel._purge_user_rows('user_submission_upvotes',      'user_id',      v_ids);
  perform devtunnel._purge_user_rows('user_submission_drafts',       'created_by',   v_ids);
  perform devtunnel._purge_user_rows('activity_log',                 'user_id',      v_ids);

  -- 2) anonymise the account row in place
  update devtunnel.users u
  set email                          = 'deleted-' || u.id::text || '@deleted.invalid',
      username                       = 'deleted-' || substr(replace(u.id::text, '-', ''), 1, 12),
      name                           = null,
      bio                            = null,
      avatar_url                     = null,
      github_id                      = 'purged-' || u.id::text,
      github_username                = null,
      github_profile_url             = null,
      skills                         = '{}',
      technologies                   = '{}',
      developer_roles                = '{}',
      experience_level               = null,
      interests                      = '{}',
      intent                         = null,
      last_login_at                  = null,
      github_access_token_encrypted  = null,
      github_access_token_expires_at = null,
      github_refresh_token_encrypted = null,
      github_refresh_token_expires_at= null
  where u.id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

-- Same posture as every other devtunnel function: only the Worker's
-- service-role key may call these.
revoke all on function devtunnel._purge_user_rows(text, text, uuid[]) from public, anon, authenticated;
revoke all on function devtunnel.purge_deleted_accounts(integer, integer) from public, anon, authenticated;
