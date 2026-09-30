-- DevTunnel — AI foundation: usage accounting + settings (Part 1).
--
-- WHY: the AI Discovery agent's Groq quota used to live in Workers KV as SIX
-- counters written per Groq call (~600 KV writes per discovery run), which
-- alone exhausted the Workers Free plan's 1,000 KV writes/day and got KV
-- writes blocked. Daily usage now lives here instead, batched by the Worker
-- (src/lib/ai/usage.ts) into ONE ai_usage_bump() call per flush; the
-- admin-editable projects/tools/tasks budget split moves to ai_settings.
--
-- ai_usage_daily is keyed (provider, day, scope):
--   scope ''             -> the provider as a whole
--   scope 'model:<id>'   -> one model (Groq budgets are per model)
--   scope 'phase:<name>' -> one AI Discovery phase (projects | tools | tasks)
-- `day` is the provider's own reset day (UTC for most; Google resets at
-- midnight Pacific — see src/lib/ai/usage.ts). tokens_est is the provider's
-- reported total when available, otherwise a chars/3.5 estimate.
--
-- The plan's minimal key was (provider, day); `scope` is an addition so
-- per-model and per-phase totals fit without a second table.
--
-- Custom budget split saved before this migration lives in KV
-- (groq:phase_budget_shares). The Worker reads it as a read-only fallback
-- until the split is saved once from the admin UI, so nothing is lost.
--
-- Run once, after 037_add_ai_discovered_task_title.sql. Safe to re-run.

create table if not exists devtunnel.ai_usage_daily (
  provider    text        not null,
  day         date        not null,
  scope       text        not null default '',
  requests    bigint      not null default 0,
  tokens_est  bigint      not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (provider, day, scope)
);

create index if not exists ai_usage_daily_day_idx on devtunnel.ai_usage_daily (day);

alter table devtunnel.ai_usage_daily enable row level security;
revoke all on devtunnel.ai_usage_daily from anon, authenticated;

-- Adds a batch of increments in one call. p_rows is a JSON array of
-- { "provider": text, "day": "YYYY-MM-DD", "scope": text,
--   "requests": int, "tokens": int }.
create or replace function devtunnel.ai_usage_bump(p_rows jsonb)
returns void
language plpgsql
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return;
  end if;

  insert into devtunnel.ai_usage_daily as u (provider, day, scope, requests, tokens_est)
  select
    r.provider,
    r.day,
    coalesce(r.scope, ''),
    sum(greatest(coalesce(r.requests, 0), 0)),
    sum(greatest(coalesce(r.tokens, 0), 0))
  from jsonb_to_recordset(p_rows) as r(provider text, day date, scope text, requests bigint, tokens bigint)
  where r.provider is not null and r.day is not null
  group by r.provider, r.day, coalesce(r.scope, '')
  on conflict (provider, day, scope) do update
    set requests   = u.requests   + excluded.requests,
        tokens_est = u.tokens_est + excluded.tokens_est,
        updated_at = now();
end;
$$;


-- Small key/value settings store for AI configuration. Currently holds
-- 'phase_budget_shares' = {"projects":0.25,"tools":0.25,"tasks":0.5}.
create table if not exists devtunnel.ai_settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

alter table devtunnel.ai_settings enable row level security;
revoke all on devtunnel.ai_settings from anon, authenticated;

-- Housekeeping helper (call manually or from a future job): usage rows older
-- than p_keep_days are of no use to the Worker, which only reads today's.
create or replace function devtunnel.ai_usage_prune(p_keep_days integer default 90)
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from devtunnel.ai_usage_daily where day < (current_date - p_keep_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;