"use client";

import { useCallback, useEffect, useState } from "react";
import { getGroqQuota } from "@/lib/admin/ai-discovery/client-api";
import type { GroqQuotaSnapshot } from "@/lib/admin/ai-discovery/types";
import { ActivityIcon } from "@/components/layout/nav-icons";

// 30s of continuous polling meant a tab left open all day made ~2,880 calls
// on its own, each one costing a rate-limit KV write on the backend
// (src/lib/rateLimit.ts) — a meaningful slice of the Workers KV free-tier
// daily put budget from a single idle admin tab. Backed off to 2 minutes,
// and paused entirely while the tab isn't visible (see the visibility
// listener below), since a background tab has no reason to keep polling.
const POLL_INTERVAL_MS = 120_000;

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatTimeUntil(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0 && minutes === 0) return "<1m";
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

type DiscoveryKind = "projects" | "tools" | "tasks";

const PHASE_LABELS: Record<DiscoveryKind, string> = {
  projects: "Projects",
  tools: "Tools",
  tasks: "Tasks/Issues",
};

interface GroqQuotaPanelProps {
  refreshKey?: number;
  /**
   * Which discovery phase this panel is for (matches the run button's
   * `kind` on the same page). When given, the panel's headline
   * Requests/Tokens numbers show THIS phase's own daily share (see
   * `PHASE_BUDGET_SHARE` in devtunnel-backend `groqQuota.ts`) instead of
   * the whole account's daily budget — so the Projects page shows only
   * the projects budget, Tools only the tools budget, and so on, since
   * that's the number that actually governs whether a run on THIS page
   * can go. Omit to fall back to the old account-wide view (all phases
   * combined, listed individually underneath).
   */
  kind?: DiscoveryKind;
}

function budgetColors(remaining: number, limit: number) {
  const exhausted = remaining === 0;
  const low = !exhausted && remaining <= Math.max(1, Math.ceil(limit * 0.2));
  return {
    exhausted,
    low,
    barColor: exhausted ? "bg-status-error" : low ? "bg-status-idle" : "bg-status-success",
    labelColor: exhausted ? "text-status-error-label" : low ? "text-status-idle-text" : "text-status-success-label",
  };
}

/**
 * Shows how much of the shared Groq free-tier budget
 * (devtunnel-backend `src/lib/groqQuota.ts` — 25 requests/minute,
 * 900/day, 6,500 tokens/minute, 180,000 tokens/day) is left right now.
 * Shows BOTH the request and token budgets, since tokens/minute is the
 * cap that actually binds for this agent's workload.
 *
 * Pass `kind` to scope the headline numbers to one discovery phase's
 * own daily share instead of the whole account's daily budget.
 */
export function GroqQuotaPanel({ refreshKey, kind }: GroqQuotaPanelProps) {
  const [snapshot, setSnapshot] = useState<GroqQuotaSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getGroqQuota();
      setSnapshot(data);
      setFailed(false);
    } catch {
      setFailed(true);
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
        // Catch up immediately on refocus, then resume the interval.
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

  if (failed || !snapshot) return null;

  const activePhase = kind ? snapshot.phases?.find((p) => p.phase === kind) : undefined;

  // Daily headline numbers: this phase's own share when `kind` is given
  // and the backend actually returned a phase breakdown, otherwise the
  // account-wide totals (old behavior). Per-minute numbers are never
  // split by phase (Groq doesn't ration those that finely) so they
  // always come from the account-wide snapshot regardless of `kind`.
  const requestsLimitPerDay = activePhase ? activePhase.limitPerDay : snapshot.limitPerDay;
  const requestsUsedToday = activePhase ? activePhase.usedToday : snapshot.usedToday;
  const requestsRemainingToday = activePhase ? activePhase.remainingToday : snapshot.remainingToday;

  const tokensLimitPerDay = activePhase ? activePhase.tokenLimitPerDay : snapshot.tokenLimitPerDay;
  const tokensUsedToday = activePhase ? activePhase.tokensUsedToday : snapshot.tokensUsedToday;
  const tokensRemainingToday = activePhase ? activePhase.tokensRemainingToday : snapshot.tokensRemainingToday;

  const requestDayPct = requestsLimitPerDay > 0 ? (requestsUsedToday / requestsLimitPerDay) * 100 : 0;
  const requestBudget = budgetColors(requestsRemainingToday, requestsLimitPerDay);

  const tokenDayPct = tokensLimitPerDay > 0 ? (tokensUsedToday / tokensLimitPerDay) * 100 : 0;
  const tokenBudget = budgetColors(tokensRemainingToday, tokensLimitPerDay);

  const anyExhausted = requestBudget.exhausted || tokenBudget.exhausted;

  return (
    <div className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-center gap-1.5">
        <ActivityIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <span className="text-[12.5px] font-medium text-text">
          Groq budget{activePhase ? ` · ${PHASE_LABELS[activePhase.phase]}` : ""}
        </span>
        {activePhase ? (
          <span className="text-[10.5px] text-text-faint">({activePhase.sharePct}% of the daily budget)</span>
        ) : null}
      </div>

      <div className="mt-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-faint">Requests</span>
          <span className={`text-[12px] font-medium ${requestBudget.labelColor}`}>
            {formatCount(requestsRemainingToday)} / {formatCount(requestsLimitPerDay)} left today
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
          <div
            className={`h-full rounded-full transition-[width] ${requestBudget.barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, requestDayPct))}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-text-faint">
          {formatCount(snapshot.remainingThisMinute)} / {formatCount(snapshot.limitPerMinute)} left this minute
          {activePhase ? " (shared across all sections)" : ""}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-faint">Tokens</span>
          <span className={`text-[12px] font-medium ${tokenBudget.labelColor}`}>
            {formatCount(tokensRemainingToday)} / {formatCount(tokensLimitPerDay)} left today
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
          <div
            className={`h-full rounded-full transition-[width] ${tokenBudget.barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, tokenDayPct))}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-text-faint">
          {formatCount(snapshot.tokensRemainingThisMinute)} / {formatCount(snapshot.tokenLimitPerMinute)} left this minute
          {activePhase ? " (shared across all sections)" : ""}
        </div>
      </div>

      {/* Only show the full per-phase breakdown when this panel ISN'T already
          scoped to one phase — otherwise it would just repeat the headline
          numbers above for `kind`'s own row. */}
      {!activePhase && snapshot.phases && snapshot.phases.length > 0 ? (
        <div className="mt-3.5 border-t border-border-subtle pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-text-faint">Split by phase</span>
            <span className="text-[10.5px] text-text-faint">projects → tools → tasks</span>
          </div>
          <div className="flex flex-col gap-2">
            {snapshot.phases.map((p) => {
              const reqPct = p.limitPerDay > 0 ? (p.usedToday / p.limitPerDay) * 100 : 0;
              const budget = budgetColors(p.remainingToday, p.limitPerDay);
              return (
                <div key={p.phase}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-text-faint">
                      {PHASE_LABELS[p.phase] ?? p.phase} <span className="text-text-faint/70">({p.sharePct}%)</span>
                    </span>
                    <span className={`text-[11px] font-medium ${budget.labelColor}`}>
                      {formatCount(p.remainingToday)} / {formatCount(p.limitPerDay)} req ·{" "}
                      {formatCount(p.tokensRemainingToday)} / {formatCount(p.tokenLimitPerDay)} tok
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border-subtle">
                    <div
                      className={`h-full rounded-full transition-[width] ${budget.barColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, reqPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-text-faint">
        <span>Resets in {formatTimeUntil(snapshot.dailyResetsAt)}</span>
      </div>

      {anyExhausted ? (
        <p className="m-0 mt-2.5 text-[11.5px] text-status-error-label">
          Today&apos;s {activePhase ? `${PHASE_LABELS[activePhase.phase]} ` : ""}Groq{" "}
          {requestBudget.exhausted && tokenBudget.exhausted ? "request and token" : requestBudget.exhausted ? "request" : "token"} budget is used up — {activePhase ? "this section's" : "discovery"} runs will pause until it resets.
        </p>
      ) : null}
    </div>
  );
}
