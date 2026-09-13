// devtunnel-frontend/src/components/admin/ai-discovery/budget-share-editor.tsx
"use client";

import { useEffect, useState } from "react";
import { getPhaseBudgetShares, setPhaseBudgetShares, AiDiscoveryApiError } from "@/lib/admin/ai-discovery/client-api";
import type { PhaseBudgetShares } from "@/lib/admin/ai-discovery/types";
import { SettingsIcon } from "@/components/layout/nav-icons";

/** Default split (25% projects / 25% tools / 50% tasks) — what "Reset to default" restores, and what a fresh install starts with before any admin ever saves a custom one. */
const DEFAULT_SHARES: PhaseBudgetShares = { projects: 25, tools: 25, tasks: 50 };

type PhaseKey = keyof PhaseBudgetShares;

const PHASE_ROWS: { key: PhaseKey; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "tools", label: "Tools" },
  { key: "tasks", label: "Tasks / Issues" },
];

/**
 * Lets an admin re-slice the shared daily Groq budget across the three
 * discovery phases instead of being stuck with the 25/25/50 default
 * (devtunnel-backend `groqQuota.ts` DEFAULT_PHASE_BUDGET_SHARE). Backed
 * by `GET`/`PUT /admin/ai/budget` — the new split takes effect on the
 * very next Groq call and re-slices whatever's LEFT of today's budget,
 * never resetting what's already been spent.
 *
 * Calls `onSaved` after a successful save so a parent (e.g. the page
 * showing `GroqQuotaPanel` alongside this) can bump a refresh key and
 * pull the updated `sharePct` values into its own display immediately.
 */
export function BudgetShareEditor({ onSaved }: { onSaved?: () => void }) {
  const [saved, setSaved] = useState<PhaseBudgetShares | null>(null);
  const [draft, setDraft] = useState<PhaseBudgetShares>(DEFAULT_SHARES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const shares = await getPhaseBudgetShares();
        if (cancelled) return;
        setSaved(shares);
        setDraft(shares);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = draft.projects + draft.tools + draft.tasks;
  const isValidTotal = total === 100;
  const isDirty = !saved || saved.projects !== draft.projects || saved.tools !== draft.tools || saved.tasks !== draft.tasks;

  function handleChange(key: PhaseKey, rawValue: string) {
    setJustSaved(false);
    setSaveError(null);
    const value = rawValue === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(rawValue))));
    setDraft((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  }

  function handleResetToDefault() {
    setJustSaved(false);
    setSaveError(null);
    setDraft(DEFAULT_SHARES);
  }

  async function handleSave() {
    if (!isValidTotal || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      const result = await setPhaseBudgetShares(draft);
      setSaved(result);
      setDraft(result);
      setJustSaved(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof AiDiscoveryApiError ? err.message : "Couldn't save the budget split. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) return null;

  return (
    <div className="mb-6 rounded-[8px] border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-center gap-1.5">
        <SettingsIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <span className="text-[12.5px] font-medium text-text">Custom budget split</span>
      </div>
      <p className="m-0 mt-1 text-[11px] text-text-faint">
        How today&apos;s shared Groq budget is divided across the three discovery phases. Must add up to 100%.
      </p>

      {isLoading ? (
        <p className="m-0 mt-3 text-[11.5px] text-text-faint">Loading current split…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2.5">
            {PHASE_ROWS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <label htmlFor={`budget-share-${key}`} className="text-[12px] text-text-muted">
                  {label}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`budget-share-${key}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={isSaving}
                    className="w-16 rounded-[6px] border border-border bg-surface px-2 py-1 text-right text-[12.5px] text-text focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                  />
                  <span className="text-[12px] text-text-faint">%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5">
            <span className={`text-[11.5px] font-medium ${isValidTotal ? "text-text-muted" : "text-status-error-label"}`}>
              Total: {total}%{!isValidTotal ? " — must equal 100%" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={isSaving}
                className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-muted transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset to 25/25/50
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValidTotal || !isDirty || isSaving}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving ? "Saving…" : "Save split"}
              </button>
            </div>
          </div>

          {saveError ? <p className="m-0 mt-2 text-[11.5px] text-status-error-label">{saveError}</p> : null}
          {justSaved && !saveError ? (
            <p className="m-0 mt-2 text-[11.5px] text-status-success-label">
              Saved — takes effect on the next Groq call, applied to whatever budget is left today.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
