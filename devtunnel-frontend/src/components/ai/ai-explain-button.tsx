"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { AiCardHeader, AiError, AiLoading, AiNotice, AiSignInPrompt } from "@/components/ai/ai-states";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { useAuth } from "@/lib/auth/use-auth";
import {
  AiExplainError,
  fetchAiIssueExplanation,
  getCachedAiExplanation,
  type AiExplainDifficulty,
  type AiExplainSource,
  type AiIssueExplanationData,
  type AiIssueExplanationResponse,
} from "@/lib/ai/explain-client";

const DIFFICULTY_LABEL: Record<AiExplainDifficulty, string> = {
  BEGINNER: "Beginner — small and well scoped",
  INTERMEDIATE: "Intermediate — needs some of the codebase",
  ADVANCED: "Advanced — involved change",
};

/** Codes where asking again can't help. */
function isPermanentFailure(code: string | undefined): boolean {
  return code === "ai_disabled" || code === "not_enough_content" || code === "issue_closed" || code === "not_found" || code === "unauthenticated";
}

/**
 * The toggle on its own — used directly by the `/issues` table, whose expanded
 * panel has to live in its own full-width `<tr>` and so can't sit next to the
 * button. Everywhere else use `AiExplainButton`, which pairs it with the panel.
 *
 * A real `<button>` with `aria-expanded` / `aria-controls` (never a link, and
 * never nested inside the row's `<a>` — see the panels that use it).
 */
export function AiExplainToggle({
  open,
  onToggle,
  controlsId,
  issueNumber,
}: {
  open: boolean;
  onToggle: () => void;
  controlsId: string;
  issueNumber: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? controlsId : undefined}
      aria-label={`${open ? "Hide" : "Explain"} issue #${issueNumber} with AI`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] border border-border-subtle bg-transparent px-2.5 py-1 text-[11.5px] font-medium text-text-dim transition-colors hover:border-border hover:bg-surface-raised hover:text-text"
    >
      <SparkleIcon className="h-3 w-3" />
      {open ? "Hide explanation" : "Explain"}
    </button>
  );
}

type Status = "loading" | "done" | "error";

interface Failure {
  message: string;
  code?: string;
}

/**
 * The expanded panel for one issue. Mount it only while it is open: it asks
 * for the explanation when it mounts (`POST /ai/issue-explanation`), so an
 * issue nobody clicks never costs a request.
 *
 * States (Part 1 rule 10):
 *  - loading ............. `role="status"`: spinner, "Explaining this issue…" and a skeleton;
 *  - done ................ the explanation, labelled "AI-generated", with a reminder that it can be wrong;
 *  - signed out .......... a sign-in prompt (the endpoint is signed-in only) — no request is made;
 *  - AI switched off ..... a one-line notice (`ai_disabled`), nothing to click;
 *  - nothing to explain .. a one-line notice (`not_enough_content`, `issue_closed`, `not_found`);
 *  - other errors ........ `role="alert"` with "Try again".
 *
 * Everything the model wrote is rendered as React text — never as HTML or
 * markdown.
 */
export function AiExplanationPanel({
  id,
  source,
  repo,
  issueNumber,
}: {
  id: string;
  source: AiExplainSource;
  /** `owner/repo` */
  repo: string;
  issueNumber: number;
}) {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<{ status: Status; data: AiIssueExplanationResponse | null; error: Failure | null }>(() => {
    const cached = getCachedAiExplanation(source, repo, issueNumber);
    return cached ? { status: "done", data: cached, error: null } : { status: "loading", data: null, error: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setState({ status: "error", data: null, error: { message: "Sign in to use AI.", code: "unauthenticated" } });
      return;
    }

    const cached = getCachedAiExplanation(source, repo, issueNumber);
    if (cached) {
      setState({ status: "done", data: cached, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    fetchAiIssueExplanation(source, repo, issueNumber, controller.signal)
      .then((data) => setState({ status: "done", data, error: null }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const failure: Failure =
          err instanceof AiExplainError
            ? err.status === 401 || err.code === "unauthenticated"
              ? { message: "Sign in to use AI.", code: "unauthenticated" }
              : { message: err.message, code: err.code }
            : { message: "The AI explanation couldn't be loaded. Try again." };
        setState({ status: "error", data: null, error: failure });
      });

    return () => controller.abort();
  }, [source, repo, issueNumber, authStatus, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const { status, data, error } = state;

  let body: JSX.Element;
  if (status === "loading") {
    body = <AiLoading message="Explaining this issue…" skeletonLines={3} />;
  } else if (status === "error" && error?.code === "unauthenticated") {
    body = <AiSignInPrompt message="Get a plain-language explanation of this issue." />;
  } else if (status === "error" && error?.code === "ai_disabled") {
    body = <AiNotice>AI explanations are turned off right now.</AiNotice>;
  } else if (status === "error" && error?.code === "not_enough_content") {
    body = <AiNotice>This issue has no description to explain yet — open it on GitHub to read the discussion.</AiNotice>;
  } else if (status === "error" && error?.code === "issue_closed") {
    body = <AiNotice>This issue has been closed, so there&apos;s nothing to work on.</AiNotice>;
  } else if (status === "error") {
    body = (
      <AiError
        message={error?.message ?? "The AI explanation couldn't be loaded."}
        onRetry={isPermanentFailure(error?.code) ? undefined : retry}
      />
    );
  } else if (data) {
    body = <ExplanationBody explanation={data.explanation} generatedAt={data.generatedAt} />;
  } else {
    body = <></>;
  }

  return (
    <section id={id} aria-label={`AI explanation of issue #${issueNumber}`} className="rounded-[8px] border border-border-subtle bg-surface-raised p-4">
      <AiCardHeader title="Issue explained" level="h4" done={status === "done"} />
      {body}
    </section>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <dt className="text-text-faint">{title}</dt>
      <dd className="m-0 text-text-secondary">
        <ul className="m-0 list-disc pl-4">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </dd>
    </>
  );
}

function ExplanationBody({ explanation, generatedAt }: { explanation: AiIssueExplanationData; generatedAt: string }) {
  return (
    <div>
      <p className="m-0 text-[13px] leading-relaxed text-text">{explanation.plainSummary}</p>

      <dl className="m-0 mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-[12px] sm:grid-cols-[120px_1fr]">
        <BulletSection title="What needs doing" items={explanation.whatNeedsToBeDone} />

        {explanation.skillsNeeded.length > 0 ? (
          <>
            <dt className="text-text-faint">Skills</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {explanation.skillsNeeded.map((skill) => (
                <span key={skill} className="inline-block rounded-[5px] border border-border-subtle px-[7px] py-[2px] text-[10.5px] text-text-secondary">
                  {skill}
                </span>
              ))}
            </dd>
          </>
        ) : null}

        {explanation.difficulty ? (
          <>
            <dt className="text-text-faint">Difficulty</dt>
            <dd className="m-0 text-text-secondary">{DIFFICULTY_LABEL[explanation.difficulty]}</dd>
          </>
        ) : null}

        <BulletSection title="First steps" items={explanation.firstSteps} />
        <BulletSection title="Watch out for" items={explanation.caveats} />
      </dl>

      <p className="m-0 mt-3 text-[11px] leading-relaxed text-text-faint">
        Written by AI from the issue text, so it can be wrong — read the issue itself before you start. Anything marked
        &ldquo;Suggestion&rdquo; is a guess the issue doesn&apos;t confirm. Generated{" "}
        <time dateTime={generatedAt}>{formatRelativeTime(generatedAt)}</time>.
      </p>
    </div>
  );
}

/**
 * "Explain" button + its inline panel, for an issue row (Part 5). Click to
 * expand, click again to collapse. The panel mounts only while open, so the
 * request happens on the first click and never before.
 *
 * Place it BESIDE the row's link, not inside it: a `<button>` inside an `<a>`
 * is invalid HTML and breaks keyboard and screen-reader use.
 */
export function AiExplainButton({
  source,
  repo,
  issueNumber,
}: {
  source: AiExplainSource;
  /** `owner/repo` */
  repo: string;
  issueNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <AiExplainToggle open={open} onToggle={() => setOpen((v) => !v)} controlsId={panelId} issueNumber={issueNumber} />
      {open ? (
        <div className="mt-2">
          <AiExplanationPanel id={panelId} source={source} repo={repo} issueNumber={issueNumber} />
        </div>
      ) : null}
    </div>
  );
}
