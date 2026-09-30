-- DevTunnel — AI admin usage panel: durable provider status (Part 7).
--
-- WHY: "this provider is exhausted until 21:14" used to live ONLY in a
-- per-isolate in-memory map (src/lib/ai/usage.ts). The admin panel is served
-- by whichever isolate answers GET /admin/ai/providers, which is usually NOT
-- the isolate that saw the 429 — so the panel would show "available" for a
-- provider that is actually out. The Worker now records exhaustion and the
-- last error class per (provider, model) here, in small batched upserts that
-- only happen when something FAILS (never per successful call, never in KV).
--
-- Error COUNTS per day need no new table: they are stored in ai_usage_daily
-- (038) under scope 'err:<class>' (requests = how many times it happened).
--
-- key is '<provider>:<model>' (same key the Worker uses in memory). Fields are
-- merged, never blanked: a row that only reports an error does not erase a
-- still-running exhaustion window, and vice versa.
--
-- Run once, after 041_ai_issue_insights.sql. Safe to re-run.

create table if not exists devtunnel.ai_provider_status (
  key               text        primary key,
  provider          text        not null,
  model             text        not null,
  exhausted_until   timestamptz,
  exhausted_reason  text,
  last_error_class  text,
  last_error_at     timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists ai_provider_status_provider_idx on devtunnel.ai_provider_status (provider);

alter table devtunnel.ai_provider_status enable row level security;
revoke all on devtunnel.ai_provider_status from anon, authenticated;

-- p_rows is a JSON array of
--   { "key": text, "provider": text, "model": text,
--     "exhausted_until": timestamptz|null, "exhausted_reason": text|null,
--     "last_error_class": text|null, "last_error_at": timestamptz|null }
-- A null field means "no news — keep what is stored".
create or replace function devtunnel.ai_provider_status_bump(p_rows jsonb)
returns void
language plpgsql
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return;
  end if;

  insert into devtunnel.ai_provider_status as s
    (key, provider, model, exhausted_until, exhausted_reason, last_error_class, last_error_at)
  select distinct on (r.key)
    r.key, r.provider, r.model, r.exhausted_until, r.exhausted_reason, r.last_error_class, r.last_error_at
  from jsonb_to_recordset(p_rows) as r(
    key text, provider text, model text,
    exhausted_until timestamptz, exhausted_reason text,
    last_error_class text, last_error_at timestamptz
  )
  where r.key is not null and r.provider is not null and r.model is not null
  order by r.key, r.last_error_at desc nulls last
  on conflict (key) do update set
    -- A new window wins if none is running; otherwise keep the later end.
    exhausted_until = case
      when excluded.exhausted_until is null then s.exhausted_until
      when s.exhausted_until is null or s.exhausted_until < now() then excluded.exhausted_until
      else greatest(s.exhausted_until, excluded.exhausted_until)
    end,
    exhausted_reason = case
      when excluded.exhausted_until is null then s.exhausted_reason
      when s.exhausted_until is null or s.exhausted_until < now() or excluded.exhausted_until > s.exhausted_until
        then excluded.exhausted_reason
      else s.exhausted_reason
    end,
    last_error_class = coalesce(excluded.last_error_class, s.last_error_class),
    last_error_at    = case when excluded.last_error_class is null then s.last_error_at else excluded.last_error_at end,
    updated_at       = now();
end;
$$;