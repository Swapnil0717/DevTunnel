-- DevTunnel — Sponsors, Part 3: one round trip for the goal bar.
--
-- Run once, after 048_sponsorships.sql. Safe to re-run.
--
-- `GET /sponsors` (src/routes/sponsors.ts) needs a month's goal AND its raised
-- total. Doing that with sponsor_month_total() plus a select on sponsor_goals
-- would be two queries; this wraps both so the whole endpoint is two queries
-- (this one + the wall list).
--
-- Always returns exactly ONE row.
--   goal_paise   the goal for that month, or — when no row exists for it yet
--                (nobody has inserted next month's row) — the most recent
--                EARLIER month's goal, so the bar never disappears on the 1st.
--                NULL only if sponsor_goals is completely empty.
--   raised_paise sum of every captured payment in that India-time month
--                (sponsor_month_total): includes anonymous sponsors and
--                sponsors who hide their amount, and ignores approved/hidden.
--
-- Same access posture as 048: service_role only.

create or replace function devtunnel.sponsor_goal_summary(p_month date)
returns table (goal_paise integer, raised_paise bigint)
language sql
stable
set search_path = devtunnel, public
as $$
  select
    (select g.goal_paise
       from devtunnel.sponsor_goals g
      where g.month <= date_trunc('month', p_month::timestamp)::date
      order by g.month desc
      limit 1),
    devtunnel.sponsor_month_total(p_month);
$$;

revoke execute on function devtunnel.sponsor_goal_summary(date) from public, anon, authenticated;
grant execute on function devtunnel.sponsor_goal_summary(date) to service_role;

-- ROLLBACK:  drop function if exists devtunnel.sponsor_goal_summary(date);
