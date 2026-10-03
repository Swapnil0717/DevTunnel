// devtunnel-frontend/src/components/admin/sponsors/edit-sponsor-dialog.tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatInr, tierName } from "@/lib/sponsors/sponsors";
import { updateAdminSponsor } from "@/lib/admin/sponsors/client-api";
import type { AdminSponsor, AdminSponsorPatch } from "@/lib/admin/sponsors/types";
import {
  CheckField,
  Field,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  sponsorErrorMessage,
} from "./sponsor-form-fields";

interface EditSponsorDialogProps {
  /** The row being edited, or `null` when the dialog is closed. */
  sponsor: AdminSponsor | null;
  onClose: () => void;
  onSaved: (sponsor: AdminSponsor) => void;
}

function EditForm({
  sponsor,
  onCancel,
  onSaved,
}: {
  sponsor: AdminSponsor;
  onCancel: () => void;
  onSaved: (sponsor: AdminSponsor) => void;
}) {
  const [displayName, setDisplayName] = useState(sponsor.displayName ?? "");
  const [githubUsername, setGithubUsername] = useState(sponsor.githubUsername ?? "");
  const [showAmount, setShowAmount] = useState(sponsor.showAmount);
  const [isAnonymous, setIsAnonymous] = useState(sponsor.isAnonymous);
  const [approved, setApproved] = useState(sponsor.approved);
  const [hidden, setHidden] = useState(sponsor.hidden);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Only what actually changed is sent, so an untouched field can never be overwritten. */
  function buildPatch(): AdminSponsorPatch {
    const patch: AdminSponsorPatch = {};
    const nextName = displayName.trim();
    if (nextName !== (sponsor.displayName ?? "")) patch.displayName = nextName === "" ? null : nextName;
    const nextUsername = githubUsername.trim();
    if (nextUsername !== (sponsor.githubUsername ?? "")) patch.githubUsername = nextUsername === "" ? null : nextUsername;
    if (showAmount !== sponsor.showAmount) patch.showAmount = showAmount;
    if (isAnonymous !== sponsor.isAnonymous) patch.isAnonymous = isAnonymous;
    if (approved !== sponsor.approved) patch.approved = approved;
    if (hidden !== sponsor.hidden) patch.hidden = hidden;
    return patch;
  }

  const patch = buildPatch();
  const hasChanges = Object.keys(patch).length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !hasChanges) return;

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateAdminSponsor(sponsor.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(sponsorErrorMessage(err, "Couldn't save these changes. Check your connection and try again."));
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="p-5">
      <h2 id="edit-sponsor-heading" className="m-0 text-[14px] font-medium text-text">
        Edit sponsor
      </h2>
      <p className="m-0 mb-4 mt-0.5 text-[12.5px] text-text-secondary">
        {formatInr(sponsor.amountInr)} · {tierName(sponsor.tier)} · {sponsor.source === "manual" ? "Manual" : "Razorpay"}.
        The amount and tier can&apos;t be edited; the tier follows the amount.
      </p>

      <div className="flex flex-col gap-3">
        <Field id="edit-name" label="Display name" hint="Up to 60 characters. Empty clears it.">
          <input
            id="edit-name"
            type="text"
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field id="edit-username" label="GitHub username" hint="Letters, digits and single hyphens. Empty clears it.">
          <input
            id="edit-username"
            type="text"
            maxLength={40}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={githubUsername}
            onChange={(event) => setGithubUsername(event.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <CheckField
          id="edit-anonymous"
          label="Show as Anonymous"
          hint="Hides the name and GitHub username on the public wall."
          checked={isAnonymous}
          onChange={setIsAnonymous}
        />
        <CheckField id="edit-show-amount" label="Show the amount on the wall" checked={showAmount} onChange={setShowAmount} />
        <CheckField
          id="edit-approved"
          label="Approved"
          hint="Only approved, captured payments appear on the wall."
          checked={approved}
          onChange={setApproved}
        />
        <CheckField
          id="edit-hidden"
          label="Hidden"
          hint="Takes the sponsor off the wall. The payment still counts toward the monthly total."
          checked={hidden}
          onChange={setHidden}
        />
      </div>

      <p role="alert" className="m-0 mt-3 text-[12px] text-status-error-label empty:hidden">
        {error}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={isSaving || !hasChanges} className={PRIMARY_BUTTON_CLASS}>
          {isSaving ? <Spinner size={13} /> : null}
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={SECONDARY_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Modal for editing one sponsor's moderation fields (`PATCH /admin/sponsors/:id`).
 * Built on the native `<dialog>` element, so focus is trapped, Escape closes
 * it and the page behind is inert without any extra code. The form is only
 * mounted while a sponsor is selected (keyed by id), so it always starts from
 * that row's current values.
 */
export function EditSponsorDialog({ sponsor, onClose, onSaved }: EditSponsorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (sponsor && !dialog.open) dialog.showModal();
    if (!sponsor && dialog.open) dialog.close();
  }, [sponsor]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-sponsor-heading"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[10px] border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      {sponsor ? <EditForm key={sponsor.id} sponsor={sponsor} onCancel={onClose} onSaved={onSaved} /> : null}
    </dialog>
  );
}
