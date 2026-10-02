"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { submitContributionFeedback } from "@/lib/tasks/client-api";
import {
  CheckCircleIcon,
  HeartIcon,
  MessageIcon,
  StarIcon,
} from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";

type PromptStep = "checking" | "ask" | "feedback" | "done";

const MESSAGE_MAX_LENGTH = 1000;
const RATINGS = [1, 2, 3, 4, 5] as const;

/** Per-task, per-browser: once answered or dismissed, the prompt stays out of the way on a refresh. */
const storageKey = (taskId: string) => `devtunnel:post-pr-prompt:${taskId}`;

function wasHandled(taskId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(taskId)) === "done";
  } catch {
    return false;
  }
}

function markHandled(taskId: string) {
  try {
    window.localStorage.setItem(storageKey(taskId), "done");
  } catch {
    // Storage can be blocked (private mode, policy). The prompt then simply
    // comes back on the next visit — nothing else depends on it.
  }
}

/**
 * The "Thanks for your contribution" card on the task Contribute page, shown
 * once the signed-in contributor's pull request is open (`IN_REVIEW` and
 * `viewerIsAssignee` — the page decides, this component just renders).
 *
 * Two ways to help, plus a way out:
 *
 *  - **Sponsor DevTunnel** — an internal link to `/sponsors`, which explains
 *    what sponsorship pays for and shows who already supports the project
 *    before offering the external Razorpay button. The card itself asks for
 *    nothing and collects nothing, and DevTunnel can't know whether anyone
 *    paid, so the card does *not* change after the click: there is no "thank
 *    you for sponsoring" state to show. The tile is always shown — the page
 *    it leads to handles a missing `NEXT_PUBLIC_SPONSOR_URL` itself.
 *  - **Give feedback** — a 1–5 rating and an optional message, saved through
 *    `POST /tasks/:id/feedback`, then a thank-you state.
 *  - **Maybe later** — skips straight to the thank-you state.
 *
 * Neither choice affects how the pull request is reviewed, and the card says
 * so. Answering or dismissing is remembered in this browser for this task so
 * the prompt doesn't reappear on refresh; a visitor who sponsors but doesn't
 * answer simply sees the card as it was.
 *
 * Renders nothing on the server and on first paint (`"checking"`), because
 * whether it was already handled is only known in the browser — showing the
 * prompt first and then hiding it would flash it at someone who already
 * answered.
 *
 * Accessibility: the rating is a labelled radio group (state in words, not
 * color alone — rule 43), errors and the thank-you are announced through a
 * live region, and every control is a real button or link.
 */
export function PostPrPrompt({ taskId }: { taskId: string }) {
  const [step, setStep] = useState<PromptStep>("checking");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep(wasHandled(taskId) ? "done" : "ask");
  }, [taskId]);

  function finish() {
    markHandled(taskId);
    setStep("done");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;

    if (rating === null) {
      setError("Pick a rating from 1 to 5 first.");
      return;
    }

    setError(null);
    setIsSending(true);
    const saved = await submitContributionFeedback(taskId, { rating, message });
    setIsSending(false);

    if (!saved) {
      setError("Couldn't send your feedback. Check your connection and try again.");
      return;
    }
    finish();
  }

  if (step === "checking") return null;

  return (
    <section
      aria-labelledby="post-pr-heading"
      className="rounded-[10px] border border-border bg-surface p-5"
    >
      {step === "done" ? (
        <div role="status" className="flex items-center gap-3">
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-status-success-label" />
          <div>
            <h2 id="post-pr-heading" className="m-0 text-[14px] font-medium text-text">
              Thank you
            </h2>
            <p className="m-0 text-[12.5px] text-text-secondary">Your PR stays in review as usual.</p>
          </div>
        </div>
      ) : step === "feedback" ? (
        <form onSubmit={handleSubmit} noValidate>
          <h2 id="post-pr-heading" className="m-0 mb-3 text-[14px] font-medium text-text">
            How was contributing through DevTunnel?
          </h2>

          <div role="radiogroup" aria-label="Rating, 1 to 5" className="mb-3 flex gap-1.5">
            {RATINGS.map((value) => {
              const selected = rating !== null && rating >= value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} of 5`}
                  onClick={() => {
                    setRating(value);
                    setError(null);
                  }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    selected
                      ? "border-accent bg-surface-raised text-accent"
                      : "border-border text-text-faint hover:bg-surface-raised hover:text-text-muted"
                  }`}
                >
                  <StarIcon className={`h-4 w-4 ${selected ? "fill-current" : ""}`} />
                </button>
              );
            })}
          </div>

          <label htmlFor="post-pr-message" className="mb-1.5 block text-[11.5px] text-text-muted">
            Message (optional)
          </label>
          <textarea
            id="post-pr-message"
            name="message"
            rows={3}
            value={message}
            maxLength={MESSAGE_MAX_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What worked, and what got in the way"
            className="w-full resize-none rounded-md border border-border bg-surface-raised p-2.5 text-[12.5px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p className="m-0 mt-1 text-right text-[10.5px] text-text-faint">
            {message.length}/{MESSAGE_MAX_LENGTH}
          </p>

          <p role="alert" className="m-0 min-h-0 text-[12px] text-status-error-label empty:hidden">
            {error}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? <Spinner size={13} /> : null}
              {isSending ? "Sending…" : "Send feedback"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("ask");
              }}
              disabled={isSending}
              className="rounded-md px-1 py-2 text-[13px] text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2 id="post-pr-heading" className="m-0 text-[14px] font-medium text-text">
            Thanks for your contribution
          </h2>
          <p className="m-0 mb-3 mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
            DevTunnel is free and open source. Choose how you would like to help next — both are
            optional and neither affects how your pull request is reviewed.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/sponsors"
              className="min-w-[200px] flex-1 rounded-[10px] border border-border bg-surface p-3.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <HeartIcon className="h-5 w-5 text-accent" />
              <span className="mt-1.5 block text-[13.5px] font-medium text-text">
                Sponsor DevTunnel
              </span>
              <span className="mt-0.5 block text-[12px] text-text-secondary">
                See who supports the project
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setStep("feedback")}
              className="min-w-[200px] flex-1 rounded-[10px] border border-border bg-surface p-3.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <MessageIcon className="h-5 w-5 text-accent" />
              <span className="mt-1.5 block text-[13.5px] font-medium text-text">Give feedback</span>
              <span className="mt-0.5 block text-[12px] text-text-secondary">
                Tell us how DevTunnel worked for you
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={finish}
            className="mt-3 rounded-md py-1 text-[12.5px] text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Maybe later
          </button>
        </>
      )}
    </section>
  );
}
