// devtunnel-frontend/src/components/admin/sponsors/sponsor-goal-editor.tsx
"use client";

import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatInr } from "@/lib/sponsors/sponsors";
import { setAdminSponsorGoal } from "@/lib/admin/sponsors/client-api";
import type { AdminSponsorGoalPayload } from "@/lib/admin/sponsors/types";
import { CheckField, Field, INPUT_CLASS, PRIMARY_BUTTON_CLASS, sponsorErrorMessage } from "./sponsor-form-fields";

interface SponsorGoalEditorProps {
  /** Current India-time month, "YYYY-MM" (from the public `GET /sponsors`). */
  month: string;
  goalInr: number;
  raisedInr: number;
}

/**
 * Sets the monthly goal (`PUT /admin/sponsor-goal`). Pre-filled from the
 * public goal, which doesn't include the note, so the note box starts empty:
 * leaving it empty keeps whatever note is stored, and "Clear the note" sends
 * `null`. The public page and wall cache for about 5 minutes, so a change
 * shows there with that delay (the message says so).
 */
export function SponsorGoalEditor({ month: initialMonth, goalInr: initialGoal, raisedInr }: SponsorGoalEditorProps) {
  const [month, setMonth] = useState(initialMonth);
  const [goal, setGoal] = useState(String(initialGoal));
  const [note, setNote] = useState("");
  const [clearNote, setClearNote] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const goalInr = Number(goal);
    if (!goal.trim() || !Number.isFinite(goalInr) || goalInr <= 0) {
      setMessage({ kind: "error", text: "Enter a goal greater than 0." });
      return;
    }

    const payload: AdminSponsorGoalPayload = { goalInr };
    if (month) payload.month = month;
    if (clearNote) payload.note = null;
    else if (note.trim()) payload.note = note.trim();

    setIsSaving(true);
    setMessage(null);
    try {
      const saved = await setAdminSponsorGoal(payload);
      setNote("");
      setClearNote(false);
      setMessage({
        kind: "ok",
        text: `Goal for ${saved.month.slice(0, 7)} set to ${formatInr(saved.goalInr)}. The public page updates within about 5 minutes.`,
      });
    } catch (err) {
      setMessage({
        kind: "error",
        text: sponsorErrorMessage(err, "Couldn't save the goal. Check your connection and try again."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="sponsor-goal-editor-heading" className="mb-6 rounded-[10px] border border-border bg-surface p-5">
      <h2 id="sponsor-goal-editor-heading" className="m-0 text-[14px] font-medium text-text">
        Monthly goal
      </h2>
      <p className="m-0 mb-3 mt-0.5 text-[12.5px] text-text-secondary">
        Raised so far in {initialMonth}: {formatInr(raisedInr)}. Goal amounts are in rupees.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="goal-month" label="Month">
            <input
              id="goal-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field id="goal-amount" label="Goal (₹)">
            <input
              id="goal-amount"
              type="number"
              inputMode="decimal"
              min={1}
              step="0.01"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field id="goal-note" label="Note (optional)" hint="Leave empty to keep the current note. Up to 200 characters.">
            <input
              id="goal-note"
              type="text"
              maxLength={200}
              value={note}
              disabled={clearNote}
              onChange={(event) => setNote(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="mt-2">
            <CheckField id="goal-clear-note" label="Clear the note" checked={clearNote} onChange={setClearNote} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
            {isSaving ? <Spinner size={13} /> : null}
            {isSaving ? "Saving…" : "Save goal"}
          </button>
          <p
            role="status"
            className={`m-0 text-[12px] empty:hidden ${
              message?.kind === "error" ? "text-status-error-label" : "text-status-success-label"
            }`}
          >
            {message?.text}
          </p>
        </div>
      </form>
    </section>
  );
}
