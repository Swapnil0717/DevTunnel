// devtunnel-frontend/src/components/admin/sponsors/add-manual-sponsor-form.tsx
"use client";

import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import { createManualSponsor } from "@/lib/admin/sponsors/client-api";
import type { AdminManualSponsorPayload, AdminSponsor } from "@/lib/admin/sponsors/types";
import {
  CheckField,
  Field,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  sponsorErrorMessage,
} from "./sponsor-form-fields";

/**
 * "Add manual sponsor" (`POST /admin/sponsors`) for someone who paid outside
 * Razorpay, e.g. a direct UPI transfer. The row counts toward this month's
 * total at once and joins the wall as soon as it is approved (approved by
 * default here; untick it to review first). The tier is worked out from the
 * amount by the backend, so there is no tier field.
 */
export function AddManualSponsorForm({ onCreated }: { onCreated: (sponsor: AdminSponsor) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showAmount, setShowAmount] = useState(false);
  const [approved, setApproved] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function reset() {
    setAmount("");
    setDisplayName("");
    setGithubUsername("");
    setPaidAt("");
    setIsAnonymous(false);
    setShowAmount(false);
    setApproved(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const amountInr = Number(amount);
    if (!amount.trim() || !Number.isFinite(amountInr) || amountInr <= 0) {
      setMessage({ kind: "error", text: "Enter an amount greater than 0." });
      return;
    }

    const payload: AdminManualSponsorPayload = { amountInr, isAnonymous, showAmount, approved };
    if (displayName.trim()) payload.displayName = displayName.trim();
    if (githubUsername.trim()) payload.githubUsername = githubUsername.trim();
    if (paidAt) {
      // `datetime-local` has no offset; the browser reads it as local time and
      // `toISOString()` gives the UTC form the backend accepts.
      const date = new Date(paidAt);
      if (Number.isNaN(date.getTime())) {
        setMessage({ kind: "error", text: "Paid on isn't a valid date and time." });
        return;
      }
      payload.paidAt = date.toISOString();
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const sponsor = await createManualSponsor(payload);
      onCreated(sponsor);
      reset();
      setIsOpen(false);
      setMessage({ kind: "ok", text: "Manual sponsor added." });
    } catch (err) {
      setMessage({
        kind: "error",
        text: sponsorErrorMessage(err, "Couldn't add this sponsor. Check your connection and try again."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="add-manual-sponsor-heading" className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="add-manual-sponsor-heading" className="sr-only">
          Add manual sponsor
        </h2>
        <button
          type="button"
          onClick={() => {
            setIsOpen((open) => !open);
            setMessage(null);
          }}
          aria-expanded={isOpen}
          aria-controls="add-manual-sponsor-form"
          className={SECONDARY_BUTTON_CLASS}
        >
          {isOpen ? "Close" : "Add manual sponsor"}
        </button>
        {!isOpen ? (
          <p
            role="status"
            className={`m-0 text-[12px] empty:hidden ${
              message?.kind === "error" ? "text-status-error-label" : "text-status-success-label"
            }`}
          >
            {message?.text}
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <form
          id="add-manual-sponsor-form"
          onSubmit={handleSubmit}
          noValidate
          className="mt-3 rounded-[10px] border border-border bg-surface p-5"
        >
          <p className="m-0 mb-3 text-[12.5px] text-text-secondary">
            For someone who paid you directly. It counts toward this month&apos;s total right away.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="manual-amount" label="Amount (₹)" hint="Rupees, up to 2 decimals. The tier follows the amount.">
              <input
                id="manual-amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field id="manual-paid-at" label="Paid on (optional)" hint="Defaults to now.">
              <input
                id="manual-paid-at"
                type="datetime-local"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field id="manual-name" label="Display name (optional)" hint="Up to 60 characters. Links are removed.">
              <input
                id="manual-name"
                type="text"
                maxLength={60}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field id="manual-username" label="GitHub username (optional)" hint="Shown as an avatar for Backers and Champions.">
              <input
                id="manual-username"
                type="text"
                maxLength={40}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={githubUsername}
                onChange={(event) => setGithubUsername(event.target.value)}
                placeholder="octocat"
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <CheckField
              id="manual-anonymous"
              label="Show as Anonymous"
              hint="Hides the name and GitHub username on the public wall."
              checked={isAnonymous}
              onChange={setIsAnonymous}
            />
            <CheckField
              id="manual-show-amount"
              label="Show the amount on the wall"
              checked={showAmount}
              onChange={setShowAmount}
            />
            <CheckField
              id="manual-approved"
              label="Approved"
              hint="Untick to review it before it joins the wall."
              checked={approved}
              onChange={setApproved}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
              {isSaving ? <Spinner size={13} /> : null}
              {isSaving ? "Adding…" : "Add sponsor"}
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
      ) : null}
    </section>
  );
}
