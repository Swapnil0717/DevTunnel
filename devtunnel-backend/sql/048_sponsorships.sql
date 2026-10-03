-- DevTunnel — Sponsors: Razorpay payments, the public sponsor wall, and the
-- monthly goal.
--
-- Backs (built in later parts): the Razorpay webhook (writes `sponsorships`),
-- the public `GET /sponsors` route (reads the approved wall + this month's
-- goal/total), and the frontend `/sponsors` page.
--
-- Run once, after 047_add_contribution_feedback.sql.
--
-- ---------------------------------------------------------------------------
-- WHAT IS (AND IS NOT) STORED
--
-- Only the fields below. The raw Razorpay webhook payload is NOT stored, and
-- neither is any card / UPI / bank / email / phone data. `razorpay_payment_id`
-- and `razorpay_event_id` are Razorpay's own opaque ids, kept for idempotency
-- and for looking a payment up in the Razorpay dashboard.
--
-- IDEMPOTENCY
--   * `razorpay_payment_id` is UNIQUE: Razorpay retries webhooks, so the handler
--     upserts on it (`on conflict (razorpay_payment_id) do update`) and a
--     replayed event converges on one row.
--   * Manual rows (source = 'manual', e.g. a bank transfer you add by hand) have
--     no payment id; Postgres allows many NULLs in a unique column.
--
-- WALL VISIBILITY
--   A sponsor appears on the public wall only when ALL are true:
--   status = 'captured' AND approved AND NOT hidden.  `approved` starts false
--   (you approve each one); `hidden` is a later takedown switch.
--   Anonymous sponsors (is_anonymous) are shown without name/username; the
--   backend must enforce that when it builds the public response, and
--   `show_amount = false` means the amount is not shown either.
--
-- TIERS (derived from amount, never set by the webhook)
--   supporter : below Rs 500       (< 50,000 paise)
--   backer    : Rs 500 to 1,999    (50,000 to 199,999 paise)
--   champion  : Rs 2,000 and above (>= 200,000 paise)
--   `tier` and `tier_rank` are GENERATED columns, so they can never disagree
--   with `amount_paise`. `tier_rank` (champion = 1 ... supporter = 3) exists
--   only so the wall can sort "highest tier first" using an index.
--   To change a threshold later, drop and re-add both generated columns.
--
-- Same access posture as every other devtunnel table (sql/001): the Worker's
-- service-role key is the only reader/writer; RLS is on with no policies and
-- no grants for anon/authenticated.
-- ---------------------------------------------------------------------------

create schema if not exists devtunnel; -- no-op if 001 already ran

-- ---------------------------------------------------------------------------
-- 1. sponsorships
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.sponsorships (
  id                   uuid primary key default gen_random_uuid(),

  -- Razorpay ids (opaque). Payment id is the idempotency key.
  razorpay_payment_id  text unique,
  razorpay_event_id    text,

  amount_paise         integer not null check (amount_paise > 0),
  currency             text not null default 'INR',

  status               text not null default 'pending'
                       check (status in ('pending', 'captured', 'refunded', 'failed')),

  -- Optional, sponsor-supplied (via the payment notes / checkout form).
  display_name         text check (display_name is null or char_length(display_name) <= 60),
  github_username      text check (github_username is null or github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  is_anonymous         boolean not null default false,
  show_amount          boolean not null default false,

  -- Derived from amount_paise; see TIERS above.
  tier                 text generated always as (
                         case
                           when amount_paise >= 200000 then 'champion'
                           when amount_paise >= 50000  then 'backer'
                           else 'supporter'
                         end
                       ) stored,
  tier_rank            smallint generated always as (
                         case
                           when amount_paise >= 200000 then 1
                           when amount_paise >= 50000  then 2
                           else 3
                         end
                       ) stored,

  approved             boolean not null default false,
  hidden               boolean not null default false,

  source               text not null default 'razorpay'
                       check (source in ('razorpay', 'manual')),

  paid_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- A Razorpay row must carry its payment id (that is what makes it idempotent).
  check (source <> 'razorpay' or razorpay_payment_id is not null),
  -- A captured payment must say when it was paid.
  check (status <> 'captured' or paid_at is not null)
);

-- Public wall: approved, visible, captured; highest tier first, then newest.
create index if not exists sponsorships_wall_idx
  on devtunnel.sponsorships (tier_rank, paid_at desc)
  where status = 'captured' and approved and not hidden;

-- Monthly totals: range scan on paid_at, amount carried in the index.
create index if not exists sponsorships_month_total_idx
  on devtunnel.sponsorships (paid_at) include (amount_paise)
  where status = 'captured';

-- Your approval queue: captured but not yet approved, newest first.
create index if not exists sponsorships_pending_approval_idx
  on devtunnel.sponsorships (created_at desc)
  where status = 'captured' and not approved;

drop trigger if exists sponsorships_set_updated_at on devtunnel.sponsorships;
create trigger sponsorships_set_updated_at
  before update on devtunnel.sponsorships
  for each row execute function devtunnel.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. sponsor_goals — one row per month (first day of the month)
-- ---------------------------------------------------------------------------
create table if not exists devtunnel.sponsor_goals (
  month       date primary key check (extract(day from month) = 1),
  goal_paise  integer not null check (goal_paise > 0),
  note        text check (note is null or char_length(note) <= 200)
);

-- This month's goal: Rs 7,000. Safe to re-run; an edited goal is never overwritten.
insert into devtunnel.sponsor_goals (month, goal_paise, note)
values (date_trunc('month', now() at time zone 'Asia/Kolkata')::date, 700000, null)
on conflict (month) do nothing;

-- ---------------------------------------------------------------------------
-- 3. sponsor_month_total(month) — sum of captured amounts, in paise
--
-- "Month" is calendar month in India time (Asia/Kolkata), so a payment made at
-- 00:30 IST on the 1st counts toward the new month. Any date inside the month
-- may be passed; it is normalised to the first of the month. Returns 0, never
-- NULL, when there are no payments. Refunded/failed/pending rows are excluded
-- because only status = 'captured' counts.
-- ---------------------------------------------------------------------------
create or replace function devtunnel.sponsor_month_total(month date)
returns bigint
language sql
stable
set search_path = devtunnel, public
as $$
  select coalesce(sum(s.amount_paise), 0)::bigint
    from devtunnel.sponsorships s
   where s.status = 'captured'
     and s.paid_at >= (date_trunc('month', month::timestamp)) at time zone 'Asia/Kolkata'
     and s.paid_at <  (date_trunc('month', month::timestamp) + interval '1 month') at time zone 'Asia/Kolkata';
$$;

revoke execute on function devtunnel.sponsor_month_total(date) from public, anon, authenticated;
grant execute on function devtunnel.sponsor_month_total(date) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Access: RLS on, no policies, no grants for anon/authenticated.
-- ---------------------------------------------------------------------------
alter table devtunnel.sponsorships enable row level security;
alter table devtunnel.sponsor_goals enable row level security;
revoke all on devtunnel.sponsorships from anon, authenticated;
revoke all on devtunnel.sponsor_goals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (run manually; this DELETES all sponsorship data)
--
--   drop function if exists devtunnel.sponsor_month_total(date);
--   drop table if exists devtunnel.sponsor_goals;
--   drop table if exists devtunnel.sponsorships;   -- also drops its indexes and trigger
--
-- Shared objects (devtunnel schema, devtunnel.set_updated_at) are used by other
-- migrations and are NOT dropped here.
-- ---------------------------------------------------------------------------
