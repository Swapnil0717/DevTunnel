"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { SelectMenu } from "@/components/ui/select-menu";
import { CheckCircleIcon } from "@/components/layout/nav-icons";
import {
  BUG_AREAS,
  BUG_LIMITS,
  BUG_SEVERITIES,
  submitBugReport,
  type BugAreaValue,
  type BugSeverityValue,
} from "@/lib/bug-reports/client-api";

const FIELD =
  "w-full rounded-md border border-border bg-surface-raised px-2.5 py-2 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const LABEL = "mb-1 mt-3 block text-[11.5px] text-text-muted";

/**
 * The header's "Found a bug" popup.
 *
 * Sends `POST /bug-reports`, which is open to signed-out visitors too (the
 * header is shown to them), so nothing here needs an account. The page the
 * reporter is on is added automatically (path only — no query string, so a
 * token in a URL can never end up in a report); the Worker adds the browser.
 *
 * "Where did it happen" and "How bad is it" use `SelectMenu`, a themed
 * dropdown, instead of native `<select>`s whose OS popup ignores the app's
 * dark theme. Esc on an open menu closes just the menu, not the dialog.
 *
 * Closing (X, Esc, backdrop, Cancel) with anything typed asks first, inline,
 * instead of silently dropping the report. After a successful send the popup
 * shows a short confirmation and closes with the same controls.
 */
export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<BugAreaValue>("projects");
  const [severity, setSeverity] = useState<BugSeverityValue>("minor");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const hasContent = [title, description, steps, expected].some((value) => value.trim() !== "");

  function requestClose() {
    if (isSending) return;
    if (!sent && hasContent) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;

    if (title.trim().length < BUG_LIMITS.titleMin) {
      setError("Add a short title.");
      return;
    }
    if (description.trim().length < BUG_LIMITS.descriptionMin) {
      setError("Describe what happened in a few words.");
      return;
    }

    setError(null);
    setIsSending(true);
    const result = await submitBugReport({
      title,
      area,
      severity,
      description,
      steps,
      expected,
      pageUrl: window.location.pathname,
    });
    setIsSending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Dialog key="sent" title="Report sent" onRequestClose={onClose}>
        <div role="status" className="mt-3 flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-status-success-label" />
          <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
            Thanks for helping us fix it. We read every report.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-md border border-border px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Close
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog
      key="form"
      title="Found a bug"
      description="Tell us what broke. We read every report."
      onRequestClose={requestClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="bug-title" className={LABEL}>
          Short title
        </label>
        <input
          id="bug-title"
          type="text"
          value={title}
          maxLength={BUG_LIMITS.titleMax}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task page shows a blank screen"
          className={FIELD}
        />

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bug-area" className={LABEL}>
              Where did it happen
            </label>
            <SelectMenu
              id="bug-area"
              value={area}
              options={BUG_AREAS}
              onChange={setArea}
            />
          </div>
          <div>
            <label htmlFor="bug-severity" className={LABEL}>
              How bad is it
            </label>
            <SelectMenu
              id="bug-severity"
              value={severity}
              options={BUG_SEVERITIES}
              onChange={setSeverity}
            />
          </div>
        </div>

        <label htmlFor="bug-description" className={LABEL}>
          What happened
        </label>
        <textarea
          id="bug-description"
          rows={3}
          value={description}
          maxLength={BUG_LIMITS.descriptionMax}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="I clicked Start task and the page went blank"
          className={`${FIELD} resize-none leading-[1.5]`}
        />

        <label htmlFor="bug-steps" className={LABEL}>
          Steps to reproduce (optional)
        </label>
        <textarea
          id="bug-steps"
          rows={3}
          value={steps}
          maxLength={BUG_LIMITS.stepsMax}
          onChange={(event) => setSteps(event.target.value)}
          placeholder={"1. Open a task\n2. Click Start task"}
          className={`${FIELD} resize-none leading-[1.5]`}
        />

        <label htmlFor="bug-expected" className={LABEL}>
          What you expected (optional)
        </label>
        <input
          id="bug-expected"
          type="text"
          value={expected}
          maxLength={BUG_LIMITS.expectedMax}
          onChange={(event) => setExpected(event.target.value)}
          placeholder="The CLI command appears"
          className={FIELD}
        />

        <p className="m-0 mt-3 text-[11.5px] text-text-faint">
          The page you&apos;re on and your browser are added automatically.
        </p>

        <p role="alert" className="m-0 mt-2 min-h-0 text-[12px] text-status-error-label empty:hidden">
          {error}
        </p>

        {confirmingDiscard ? (
          <div
            role="alertdialog"
            aria-label="Discard this report?"
            className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5"
          >
            <span className="mr-auto text-[12.5px] text-text-secondary">
              Discard this report?
            </span>
            <button
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              className="rounded-md border border-border px-3 py-1.5 text-[12.5px] text-text transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-text px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? <Spinner size={13} /> : null}
              {isSending ? "Sending…" : "Send report"}
            </button>
            <button
              type="button"
              onClick={requestClose}
              disabled={isSending}
              className="rounded-md px-1 py-2 text-[13px] text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
