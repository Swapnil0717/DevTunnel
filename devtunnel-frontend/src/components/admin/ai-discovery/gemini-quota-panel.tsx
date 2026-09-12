"use client";

import { useCallback, useEffect, useState } from "react";
import { getGeminiQuota } from "@/lib/admin/ai-discovery/client-api";
import type { GeminiQuotaSnapshot } from "@/lib/admin/ai-discovery/types";
import { ActivityIcon } from "@/components/layout/nav-icons";

const POLL_INTERVAL_MS = 30_000;

/** `18` -> `18`, `0` -> `0` — just a plain integer formatter, kept as its own helper for readability at call sites. */
function formatCount(n: number): string {
  return n.toLocaleString();
}

/** `2h 15m`, `48m`, `<1m` — how long until the daily counter resets, derived fresh on every render from `resetsAt`. */
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

interface GeminiQuotaPanelProps {
  /**
   * Bump this (e.g. with a counter incremented after each run) to force
   * an immediate refetch instead of waiting for the next poll —
   * `AiDiscoveryRunButton` does this so the panel reflects a run's
   * usage right away rather than up to `POLL_INTERVAL_MS` later.
   */
  refreshKey?: number;
}

/**
 * Shows how much of the shared Gemini free-tier request budget
 * (devtunnel-backend `src/lib/geminiQuota.ts` — 4 requests/minute,
 * 18/day, rationed under Google's real 5/20 free-tier caps) is left
 * right now. Read-only — polling this never spends any budget itself.
 *
 * Used two ways: standalone on the Confirmation page (which doesn't run
 * discovery itself), and embedded inside `AiDiscoveryRunButton` on the
 * three per-kind admin pages, where `refreshKey` keeps it in sync with
 * each run.
 */
export function GeminiQuotaPanel({ refreshKey }: GeminiQuotaPanelProps) {
  const [snapshot, setSnapshot] = useState<GeminiQuotaSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getGeminiQuota();
      setSnapshot(data);
      setFailed(false);
    } catch {
      // Non-fatal — the panel just stays hidden/stale rather than
      // blocking the rest of the page (this is a supplementary readout,
      // not something the discovery flow depends on).
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

  const dayPct = snapshot.limitPerDay > 0 ? (snapshot.usedToday / snapshot.limitPerDay) * 100 : 0;
  const exhausted = snapshot.remainingToday === 0;
  const low = !exhausted && snapshot.remainingToday <= Math.max(1, Math.ceil(snapshot.limitPerDay * 0.2));

  const barColor = exhausted ? "bg-status-error" : low ? "bg-status-idle" : "bg-status-success";
  const labelColor = exhausted ? "text-status-error-label" : low ? "text-status-idle-text" : "text-status-success-label";

  return (
    <div className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <ActivityIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="text-[12.5px] font-medium text-text">Gemini request budget</span>
        </div>
        <span className={`text-[12px] font-medium ${labelColor}`}>
          {formatCount(snapshot.remainingToday)} / {formatCount(snapshot.limitPerDay)} left today
        </span>
      </div>

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
        <div
          className={`h-full rounded-full transition-[width] ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, dayPct))}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-text-faint">
        <span>
          {formatCount(snapshot.remainingThisMinute)} / {formatCount(snapshot.limitPerMinute)} left this minute
        </span>
        <span>Resets in {formatTimeUntil(snapshot.dailyResetsAt)}</span>
      </div>

      {exhausted ? (
        <p className="m-0 mt-2.5 text-[11.5px] text-status-error-label">
          Today&apos;s Gemini budget is used up — discovery runs will pause until it resets.
        </p>
      ) : null}
    </div>
  );
}