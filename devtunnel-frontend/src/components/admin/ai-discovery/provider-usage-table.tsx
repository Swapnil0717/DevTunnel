// devtunnel-frontend/src/components/admin/ai-discovery/provider-usage-table.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { getAiProviders } from "@/lib/admin/ai-discovery/client-api";
import type { AiProviderModelUsage, AiProviderUsage, AiProvidersSnapshot } from "@/lib/admin/ai-discovery/types";
import { ActivityIcon } from "@/components/layout/nav-icons";
import { AiError, AiLoading, AI_SECONDARY_BUTTON_CLASS } from "@/components/ai/ai-states";
import { formatRelativeTime } from "@/lib/home/format-relative-time";

// Same polling posture as GroqQuotaPanel: a slow interval, paused while the
// tab is hidden. Each poll is one Supabase read on the backend (no Workers KV).
const POLL_INTERVAL_MS = 120_000;

const ERROR_CLASS_LABEL: Record<string, string> = {
  quota: "Quota / rate limit",
  too_large: "Request too large",
  auth: "Auth failed — check the API key",
  server: "Provider error (5xx)",
  timeout: "Timed out",
  network: "Network error",
  bad_request: "Request rejected (a bug on our side)",
};

const errorLabel = (errorClass: string) => ERROR_CLASS_LABEL[errorClass] ?? errorClass;

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatTimeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0 && minutes === 0) return "<1m";
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Status is always TEXT plus a dot — never colour alone. */
function StatusPill({ provider }: { provider: AiProviderUsage }) {
  if (provider.status === "not_configured") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-text-faint">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border" />
        Not configured
      </span>
    );
  }
  if (provider.status === "exhausted" && provider.exhaustedUntil) {
    return (
      <span className="inline-flex flex-col text-[11.5px] font-medium text-status-error-label">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-error" />
          Exhausted
        </span>
        <span className="font-normal text-text-faint">
          until {formatClock(provider.exhaustedUntil)} (in {formatTimeUntil(provider.exhaustedUntil)})
        </span>
      </span>
    );
  }
  const someModelExhausted = provider.models.some((m) => m.status === "exhausted");
  return (
    <span className="inline-flex flex-col text-[11.5px] font-medium text-status-success-label">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-success" />
        Available
      </span>
      {someModelExhausted ? <span className="font-normal text-status-idle-text">one model is exhausted</span> : null}
    </span>
  );
}

function LastError({ provider }: { provider: AiProviderUsage }) {
  const counts = Object.entries(provider.errorsToday).filter(([, n]) => n > 0);
  if (!provider.lastError && counts.length === 0) return <span className="text-text-faint">None recorded</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {provider.lastError ? (
        <span className={provider.lastError.errorClass === "auth" ? "font-medium text-status-error-label" : "text-text-secondary"}>
          {errorLabel(provider.lastError.errorClass)}
          <span className="text-text-faint"> · {formatRelativeTime(provider.lastError.at)}</span>
        </span>
      ) : null}
      {counts.length > 0 ? (
        <span className="text-text-faint">Today: {counts.map(([cls, n]) => `${errorLabel(cls)} ×${formatCount(n)}`).join(", ")}</span>
      ) : null}
    </span>
  );
}

function ModelRow({ model, showRole }: { model: AiProviderModelUsage; showRole: boolean }) {
  return (
    <tr className="text-[11px] text-text-faint">
      <td className="py-1 pl-5 pr-3">
        <span className="break-all">{model.model}</span>
        {showRole && model.role ? <span> · {model.role}</span> : null}
      </td>
      <td className="py-1 pr-3">
        {model.status === "exhausted" && model.exhaustedUntil ? (
          <span className="text-status-error-label">Exhausted until {formatClock(model.exhaustedUntil)}</span>
        ) : (
          "Available"
        )}
      </td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(model.requestsToday)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{formatCount(model.tokensEstToday)}</td>
      <td className="py-1 pr-3" />
      <td className="py-1" />
    </tr>
  );
}

/**
 * Multi-provider AI usage table for the admin AI pages (Part 7): one row per
 * provider with today's requests and estimated tokens, whether it is
 * available or exhausted (until when), and its last error class; providers
 * that run several models (Groq) list each model underneath.
 *
 * Data: `GET /admin/ai/providers` — Supabase-backed and read-only (see the
 * backend's `adminProviders.ts` for what each number means). This sits next
 * to `GroqQuotaPanel`, which stays the discovery-phase budget view (the
 * projects/tools/tasks split); this table answers "which providers are
 * working and what have they used".
 *
 * States: loading (`role="status"` skeleton), error with retry (`role="alert"`),
 * loaded. A failed background refresh keeps the last good data on screen and
 * says so rather than blanking the table.
 */
export function ProviderUsageTable({ refreshKey }: { refreshKey?: number }) {
  const [snapshot, setSnapshot] = useState<AiProvidersSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setSnapshot(await getAiProviders());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(load, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        load();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  useEffect(() => {
    if (refreshKey !== undefined) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <ActivityIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <h2 className="m-0 text-[12.5px] font-medium text-text">AI providers</h2>
        {snapshot ? (
          <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10.5px] text-text-dim">
            User-facing AI: {snapshot.featuresEnabled ? "on" : "off"}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-text-faint">
        {snapshot ? <span>Updated {formatRelativeTime(snapshot.generatedAt)}</span> : null}
        <button type="button" onClick={load} disabled={refreshing} className={AI_SECONDARY_BUTTON_CLASS}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );

  if (!snapshot && !failed) {
    return (
      <section aria-label="AI providers" className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
        {heading}
        <AiLoading className="mt-3" message="Loading provider usage…" skeletonLines={4} />
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section aria-label="AI providers" className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
        {heading}
        <AiError className="mt-3" message="Couldn't load AI provider usage." onRetry={load} />
      </section>
    );
  }

  const configured = snapshot.providers.filter((p) => p.configured);
  const anyAuthProblem = configured.filter((p) => p.lastError?.errorClass === "auth");
  const allExhausted = configured.length > 0 && configured.every((p) => p.status === "exhausted");

  return (
    <section aria-label="AI providers" className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
      {heading}

      {failed ? (
        <AiError className="mt-3" message="Couldn't refresh — showing the last data that loaded." onRetry={load} />
      ) : null}

      {!snapshot.featuresEnabled ? (
        <p role="status" className="m-0 mt-3 text-[11.5px] text-text-muted">
          User-facing AI (search, summaries, explanations, insights) is switched off with AI_FEATURES_ENABLED=false. AI Discovery is unaffected.
        </p>
      ) : null}
      {configured.length === 0 ? (
        <p role="alert" className="m-0 mt-3 text-[11.5px] text-status-error-label">
          No AI provider is configured — set an API key and a model variable for at least one.
        </p>
      ) : null}
      {allExhausted ? (
        <p role="alert" className="m-0 mt-3 text-[11.5px] text-status-error-label">
          Every configured provider is exhausted right now — AI requests will fall back to plain search or an &quot;AI unavailable&quot; message until one resets.
        </p>
      ) : null}
      {anyAuthProblem.length > 0 ? (
        <p role="alert" className="m-0 mt-3 text-[11.5px] text-status-error-label">
          {anyAuthProblem.map((p) => p.label).join(", ")}: the last request was refused as unauthorised — check that provider&apos;s API key.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
          <caption className="sr-only">AI provider usage today, status and last error</caption>
          <thead>
            <tr className="border-b border-border-subtle text-[10.5px] font-normal uppercase tracking-wide text-text-faint">
              <th scope="col" className="py-1.5 pr-3 font-normal">Provider</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Status</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">Requests today</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">Est. tokens today</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Last error</th>
              <th scope="col" className="py-1.5 font-normal">Resets in</th>
            </tr>
          </thead>
          {snapshot.providers.map((p) => (
            <tbody key={p.id} className="border-b border-border-subtle last:border-b-0">
              <tr className={p.configured ? "align-top text-text" : "align-top text-text-faint"}>
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {p.label}
                  {!p.configured ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-text-faint">Needs: {p.missing.join(", ")}</span>
                  ) : null}
                </th>
                <td className="py-2 pr-3">
                  <StatusPill provider={p} />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.configured ? formatCount(p.requestsToday) : "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.configured ? formatCount(p.tokensEstToday) : "—"}</td>
                <td className="py-2 pr-3 text-[11.5px]">{p.configured ? <LastError provider={p} /> : "—"}</td>
                <td className="py-2 text-[11.5px] text-text-faint">{p.configured ? formatTimeUntil(p.dailyResetsAt) : "—"}</td>
              </tr>
              {p.models.map((m) => (
                <ModelRow key={m.model} model={m} showRole={p.models.length > 1 || m.role !== null} />
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className="m-0 mt-2.5 text-[10.5px] leading-relaxed text-text-faint">
        Requests count successful calls; failures are under Last error. Tokens are the provider&apos;s reported totals, or an estimate when it sends none.
        &quot;Available&quot; means not known to be exhausted — it doesn&apos;t mean quota remains. Counters roll over at each provider&apos;s own reset (Google: midnight Pacific).
      </p>
    </section>
  );
}
