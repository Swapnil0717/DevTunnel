"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  BugIcon,
  CheckCircleIcon,
  ChecklistIcon,
  ChevronRightIcon,
  FolderIcon,
  TerminalIcon,
  UserIcon,
} from "@/components/layout/nav-icons";
import { useAuth } from "@/lib/auth/use-auth";
import {
  BUG_AREAS,
  BUG_LIMITS,
  BUG_SEVERITIES,
  submitBugReport,
  type BugAreaValue,
  type BugSeverityValue,
} from "@/lib/bug-reports/client-api";

const FIELD =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-faint transition-colors focus:border-accent focus:outline-none";
const LABEL_ROW = "mb-2 mt-5 flex items-baseline justify-between gap-3";
const LABEL = "text-[12.5px] text-text-muted";
const COUNT = "font-mono text-[11px] text-text-faint";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TAG =
  "inline-flex max-w-full items-center gap-1 truncate rounded-[5px] border border-border-subtle bg-bg px-1.5 py-0.5 font-mono text-[11.5px] text-text-secondary";

function DotsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
    </svg>
  );
}

/** One icon per `BUG_AREAS` value, drawn on the chips. */
const AREA_ICONS: Record<BugAreaValue, ComponentType<{ className?: string }>> = {
  projects: FolderIcon,
  tasks: ChecklistIcon,
  cli: TerminalIcon,
  profile: UserIcon,
  other: DotsIcon,
};

/** How many of the three signal bars light up for each severity. */
const SEVERITY_BARS: Record<BugSeverityValue, number> = { minor: 1, broken: 2, blocked: 3 };

const SEVERITY_HINTS: Record<BugSeverityValue, string> = {
  minor: "It works, but it's off.",
  broken: "A feature fails.",
  blocked: "I'm stuck.",
};

/** "Chrome on Windows" from the user-agent string — display only, never sent. */
function describeBrowser(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Your browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

function SeverityBars({ count }: { count: number }) {
  return (
    <span aria-hidden="true" className="flex h-3.5 items-end gap-[3px]">
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          style={{ height: 4 + bar * 3 }}
          className={`w-[5px] rounded-[1px] ${bar <= count ? "bg-current" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

/**
 * The header's "Found a bug" popup.
 *
 * Sends `POST /bug-reports`, which is open to signed-out visitors too (the
 * header shows this button to them), so nothing here needs an account. The
 * page the reporter is on is added automatically (path only — no query
 * string, so a token in a URL can never end up in a report); the Worker adds
 * the browser. A "Sent with your report" strip shows exactly that, plus
 * whether the report will be linked to an account, so nothing leaves
 * unannounced.
 *
 * Layout, top to bottom — the quick taps first, the typing after:
 *  1. **Where did it happen** — icon chips (`AREA_ICONS`), one per area.
 *  2. **How bad is it** — three cards with 1 / 2 / 3 signal bars. Bars rather
 *     than red/amber/green: the choice is a size, not a good/bad state, and it
 *     reads without color.
 *  3. **Short title** and **What happened**, each with a live character count
 *     and its own inline error (shown on Send, cleared as soon as you edit).
 *  4. **Add more detail** — steps and expected result, collapsed unless one
 *     of them already has text.
 *
 * Ctrl / Cmd + Enter sends from anywhere in the form. Closing (X, Esc,
 * backdrop, Cancel) with anything typed asks first, inline, instead of
 * silently dropping the report. After a send the popup shows what was
 * reported and offers "Report another".
 */
export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [area, setArea] = useState<BugAreaValue>("projects");
  const [severity, setSeverity] = useState<BugSeverityValue>("minor");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [showMore, setShowMore] = useState(false);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState<{ area: BugAreaValue; severity: BugSeverityValue } | null>(
    null,
  );
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Read in an effect, not during render: this runs only in the browser.
  const [pagePath, setPagePath] = useState("");
  const [browser, setBrowser] = useState("");
  useEffect(() => {
    setPagePath(window.location.pathname);
    setBrowser(describeBrowser(window.navigator.userAgent));
  }, []);

  const hasContent = [title, description, steps, expected].some((value) => value.trim() !== "");
  const detailOpen = showMore || steps.trim() !== "" || expected.trim() !== "";

  function requestClose() {
    if (isSending) return;
    if (!sent && hasContent) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setSteps("");
    setExpected("");
    setShowMore(false);
    setTitleError(null);
    setDescriptionError(null);
    setError(null);
    setConfirmingDiscard(false);
    setSent(null);
  }

  async function submit() {
    if (isSending) return;

    const titleProblem =
      title.trim().length < BUG_LIMITS.titleMin ? "Add a short title." : null;
    const descriptionProblem =
      description.trim().length < BUG_LIMITS.descriptionMin
        ? "Describe what happened in a few words."
        : null;
    setTitleError(titleProblem);
    setDescriptionError(descriptionProblem);
    if (titleProblem || descriptionProblem) {
      setError(null);
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
    setSent({ area, severity });
  }

  if (sent) {
    const areaLabel = BUG_AREAS.find((item) => item.value === sent.area)?.label;
    const severityLabel = BUG_SEVERITIES.find((item) => item.value === sent.severity)?.label;
    return (
      <Dialog key="sent" size="md" title="Report sent" onRequestClose={onClose}>
        <div role="status" className="flex flex-col items-center px-2 pb-1 pt-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-status-success-border bg-status-success-bg">
            <CheckCircleIcon className="h-6 w-6 text-status-success-label" />
          </span>
          <p className="m-0 mt-4 max-w-[340px] text-[13px] leading-relaxed text-text-secondary">
            Thanks for helping us fix it. We read every report, and the ones marked
            &quot;I can&apos;t continue&quot; go first.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {areaLabel ? <span className={TAG}>{areaLabel}</span> : null}
            {severityLabel ? <span className={TAG}>{severityLabel}</span> : null}
          </div>
          <div className="mt-6 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg bg-text px-4 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary ${FOCUS}`}
            >
              Close
            </button>
            <button
              type="button"
              onClick={resetForm}
              className={`rounded-lg border border-border px-4 py-2 text-[13px] text-text transition-colors hover:bg-surface-raised ${FOCUS}`}
            >
              Report another
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      key="form"
      size="md"
      title="Found a bug"
      description="Tell us what broke. We read every report."
      icon={
        <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-status-success-border bg-status-success-bg text-accent">
          <BugIcon className="h-5 w-5" />
        </span>
      }
      onRequestClose={requestClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        noValidate
      >
        <div role="group" aria-labelledby="bug-area-label">
          <p id="bug-area-label" className={`m-0 mb-2 mt-5 ${LABEL}`}>
            Where did it happen
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BUG_AREAS.map((item) => {
              const Icon = AREA_ICONS[item.value];
              const selected = item.value === area;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setArea(item.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] transition-colors ${FOCUS} ${
                    selected
                      ? "border-accent bg-status-success-bg text-status-success-label"
                      : "border-border bg-surface-raised text-text-secondary hover:border-border hover:text-text"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? "text-accent" : "text-text-dim"}`} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div role="group" aria-labelledby="bug-severity-label">
          <p id="bug-severity-label" className={`m-0 mb-2 mt-5 ${LABEL}`}>
            How bad is it
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {BUG_SEVERITIES.map((item) => {
              const selected = item.value === severity;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSeverity(item.value)}
                  className={`flex flex-col items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${FOCUS} ${
                    selected
                      ? "border-accent bg-status-success-bg text-accent"
                      : "border-border bg-surface-raised text-text-dim hover:text-text-muted"
                  }`}
                >
                  <SeverityBars count={SEVERITY_BARS[item.value]} />
                  <span className={`text-[13px] ${selected ? "text-text" : "text-text-secondary"}`}>
                    {item.label}
                  </span>
                  <span className="text-[11.5px] leading-snug text-text-dim">
                    {SEVERITY_HINTS[item.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={LABEL_ROW}>
          <label htmlFor="bug-title" className={LABEL}>
            Short title
          </label>
          <span className={COUNT}>
            {title.length} / {BUG_LIMITS.titleMax}
          </span>
        </div>
        <input
          id="bug-title"
          type="text"
          value={title}
          maxLength={BUG_LIMITS.titleMax}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "bug-title-error" : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(null);
          }}
          placeholder="Task page shows a blank screen"
          className={FIELD}
        />
        {titleError ? (
          <p id="bug-title-error" className="m-0 mt-1.5 text-[12px] text-status-error-label">
            {titleError}
          </p>
        ) : null}

        <div className={LABEL_ROW}>
          <label htmlFor="bug-description" className={LABEL}>
            What happened
          </label>
          <span className={COUNT}>
            {description.length} / {BUG_LIMITS.descriptionMax}
          </span>
        </div>
        <textarea
          id="bug-description"
          rows={3}
          value={description}
          maxLength={BUG_LIMITS.descriptionMax}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? "bug-description-error" : undefined}
          onChange={(event) => {
            setDescription(event.target.value);
            setDescriptionError(null);
          }}
          placeholder="I clicked Start task and the page went blank"
          className={`${FIELD} resize-none leading-[1.55]`}
        />
        {descriptionError ? (
          <p
            id="bug-description-error"
            className="m-0 mt-1.5 text-[12px] text-status-error-label"
          >
            {descriptionError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={detailOpen}
          aria-controls="bug-more"
          className={`mt-4 inline-flex items-center gap-1.5 rounded text-[12.5px] text-text-muted transition-colors hover:text-text ${FOCUS}`}
        >
          <ChevronRightIcon
            className={`h-3.5 w-3.5 transition-transform ${detailOpen ? "rotate-90" : ""}`}
          />
          Add more detail <span className="text-text-faint">(optional)</span>
        </button>

        {detailOpen ? (
          <div id="bug-more">
            <div className={LABEL_ROW}>
              <label htmlFor="bug-steps" className={LABEL}>
                Steps to reproduce
              </label>
              <span className={COUNT}>
                {steps.length} / {BUG_LIMITS.stepsMax}
              </span>
            </div>
            <textarea
              id="bug-steps"
              rows={3}
              value={steps}
              maxLength={BUG_LIMITS.stepsMax}
              onChange={(event) => setSteps(event.target.value)}
              placeholder={"1. Open a task\n2. Click Start task"}
              className={`${FIELD} resize-none leading-[1.55]`}
            />

            <div className={LABEL_ROW}>
              <label htmlFor="bug-expected" className={LABEL}>
                What you expected
              </label>
              <span className={COUNT}>
                {expected.length} / {BUG_LIMITS.expectedMax}
              </span>
            </div>
            <input
              id="bug-expected"
              type="text"
              value={expected}
              maxLength={BUG_LIMITS.expectedMax}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="The CLI command appears"
              className={FIELD}
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[12px] text-text-dim">
          <span>Sent with your report</span>
          {pagePath ? <span className={TAG}>{pagePath}</span> : null}
          {browser ? <span className={TAG}>{browser}</span> : null}
          <span className={TAG}>{user ? `Linked to ${user.username}` : "Not signed in"}</span>
        </div>
        <p className="m-0 mt-2 text-[11.5px] text-text-faint">
          Only the page path is sent, never the query string.
        </p>

        <p
          role="alert"
          className="m-0 mt-3 min-h-0 text-[12.5px] text-status-error-label empty:hidden"
        >
          {error}
        </p>

        {confirmingDiscard ? (
          <div
            role="alertdialog"
            aria-label="Discard this report?"
            className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
          >
            <span className="mr-auto text-[12.5px] text-text-secondary">Discard this report?</span>
            <button
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              className={`rounded-md border border-border px-3 py-1.5 text-[12.5px] text-text transition-colors hover:bg-surface ${FOCUS}`}
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md bg-text px-3 py-1.5 text-[12.5px] font-medium text-bg transition-colors hover:bg-text-secondary ${FOCUS}`}
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSending}
              className={`inline-flex items-center gap-2 rounded-lg bg-text px-4 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
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
            <span className="ml-auto hidden font-mono text-[11px] text-text-faint sm:inline">
              Ctrl + Enter
            </span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
