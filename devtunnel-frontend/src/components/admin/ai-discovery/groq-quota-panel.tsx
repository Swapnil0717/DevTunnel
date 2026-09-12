"use client";

import { useCallback, useEffect, useState } from "react";
import { getGroqQuota } from "@/lib/admin/ai-discovery/client-api";
import type { GroqQuotaSnapshot } from "@/lib/admin/ai-discovery/types";
import { ActivityIcon } from "@/components/layout/nav-icons";

const POLL_INTERVAL_MS = 30_000;

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

interface GroqQuotaPanelProps {
  refreshKey?: number;
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
 */
export function GroqQuotaPanel({ refreshKey }: GroqQuotaPanelProps) {
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
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [load]);

  useEffect(() => {
    if (refreshKey !== undefined) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (failed || !snapshot) return null;

  const requestDayPct = snapshot.limitPerDay > 0 ? (snapshot.usedToday / snapshot.limitPerDay) * 100 : 0;
  const requestBudget = budgetColors(snapshot.remainingToday, snapshot.limitPerDay);

  const tokenDayPct = snapshot.tokenLimitPerDay > 0 ? (snapshot.tokensUsedToday / snapshot.tokenLimitPerDay) * 100 : 0;
  const tokenBudget = budgetColors(snapshot.tokensRemainingToday, snapshot.tokenLimitPerDay);

  const anyExhausted = requestBudget.exhausted || tokenBudget.exhausted;

  return (
    <div className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-center gap-1.5">
        <ActivityIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <span className="text-[12.5px] font-medium text-text">Groq budget</span>
      </div>

      <div className="mt-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-faint">Requests</span>
          <span className={`text-[12px] font-medium ${requestBudget.labelColor}`}>
            {formatCount(snapshot.remainingToday)} / {formatCount(snapshot.limitPerDay)} left today
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
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-faint">Tokens</span>
          <span className={`text-[12px] font-medium ${tokenBudget.labelColor}`}>
            {formatCount(snapshot.tokensRemainingToday)} / {formatCount(snapshot.tokenLimitPerDay)} left today
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
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-text-faint">
        <span>Resets in {formatTimeUntil(snapshot.dailyResetsAt)}</span>
      </div>

      {anyExhausted ? (
        <p className="m-0 mt-2.5 text-[11.5px] text-status-error-label">
          Today&apos;s Groq {requestBudget.exhausted && tokenBudget.exhausted ? "request and token" : requestBudget.exhausted ? "request" : "token"} budget is used up — discovery runs will pause until it resets.
        </p>
      ) : null}
    </div>
  );
}