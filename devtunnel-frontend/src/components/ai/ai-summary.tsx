"use client";

import { AiCardHeader, AiError, AiLoading, AiNotice, AiSignInPrompt } from "@/components/ai/ai-states";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { isPermanentSummaryFailure, useAiSummary } from "@/lib/ai/use-ai-summary";
import type { AiSetupDifficulty, AiSummaryData, AiSummaryKind } from "@/lib/ai/summary-client";

const DIFFICULTY_LABEL: Record<AiSetupDifficulty, string> = {
  BEGINNER: "Beginner — a couple of commands",
  INTERMEDIATE: "Intermediate — several steps",
  ADVANCED: "Advanced — involved setup",
};

/**
 * `inset` sits inside a detail page's already-bordered "info" panel;
 * `card` is a stand-alone card for a side rail (the submission page).
 */
export type AiSummaryVariant = "inset" | "card";

const WRAPPER_CLASS: Record<AiSummaryVariant, string> = {
  inset: "mb-4 rounded-[8px] border border-border-subtle bg-surface-raised p-4",
  card: "rounded-[10px] border border-border bg-surface p-4",
};

/**
 * AI summary card for the five detail pages (Part 4): DevTunnel projects,
 * DevTunnel tools, GitHub projects, GitHub tools and community submissions.
 *
 * The pages themselves are server-rendered and don't change; this card
 * fetches its summary from the browser AFTER load (`useAiSummary` →
 * `POST /ai/summary`), so a slow or failing model never slows or breaks the
 * page. The backend returns a stored summary whenever one exists, so most
 * visits make no model call at all.
 *
 * States (Part 1 rule 10):
 *  - loading ............. `role="status"`: spinner, "Generating summary…" and a skeleton;
 *  - done ................ the summary, labelled "AI-generated", with a plain-language
 *                          reminder that it can be wrong;
 *  - signed out .......... a sign-in prompt (the endpoint is signed-in only);
 *  - AI switched off ..... a one-line notice (`ai_disabled`), nothing to click;
 *  - nothing to summarise  a one-line notice (`not_enough_content`);
 *  - other errors ........ `role="alert"` with "Try again".
 *
 * Everything the model wrote is rendered as React text — never as HTML or
 * markdown — and the tech tags reuse the app's own tag styling.
 */
export function AiSummary({
  kind,
  subjectKey,
  variant = "inset",
}: {
  kind: AiSummaryKind;
  /** The page's slug — the same value the detail route takes. */
  subjectKey: string;
  variant?: AiSummaryVariant;
}) {
  const { status, data, error, retry } = useAiSummary(kind, subjectKey);

  const heading = <AiCardHeader title="Summary" level={variant === "card" ? "h2" : "h3"} done={status === "done"} />;

  let body: JSX.Element;

  if (status === "loading") {
    body = <AiLoading message="Generating summary…" skeletonLines={3} />;
  } else if (status === "error" && error?.code === "unauthenticated") {
    body = <AiSignInPrompt message="Get a short AI-written summary of this page." />;
  } else if (status === "error" && error?.code === "ai_disabled") {
    body = <AiNotice>AI summaries are turned off right now.</AiNotice>;
  } else if (status === "error" && error?.code === "not_enough_content") {
    body = <AiNotice>There isn&apos;t enough written about this project to summarise yet.</AiNotice>;
  } else if (status === "error") {
    body = (
      <AiError
        message={error?.message ?? "The AI summary couldn't be loaded."}
        onRetry={isPermanentSummaryFailure(error) ? undefined : retry}
      />
    );
  } else if (data) {
    body = <SummaryBody summary={data.summary} generatedAt={data.generatedAt} variant={variant} />;
  } else {
    body = <></>;
  }

  return (
    <section aria-label="AI summary" className={WRAPPER_CLASS[variant]}>
      {heading}
      {body}
    </section>
  );
}

function SummaryBody({
  summary,
  generatedAt,
  variant,
}: {
  summary: AiSummaryData;
  generatedAt: string;
  variant: AiSummaryVariant;
}) {
  const hasDetails = summary.techStack.length > 0 || summary.goodFor.length > 0 || summary.setupDifficulty !== null;
  const rowGrid = variant === "card" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[110px_1fr]";

  return (
    <div>
      <p className="m-0 text-[13px] leading-relaxed text-text">{summary.tldr}</p>
      <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-text-secondary">{summary.whatItDoes}</p>

      {hasDetails ? (
        <dl className={`m-0 mt-3 grid ${rowGrid} gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-[12px]`}>
          {summary.techStack.length > 0 ? (
            <>
              <dt className="text-text-faint">Tech</dt>
              <dd className="m-0 flex flex-wrap gap-1.5">
                {summary.techStack.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </>
          ) : null}

          {summary.goodFor.length > 0 ? (
            <>
              <dt className="text-text-faint">Good for</dt>
              <dd className="m-0 text-text-secondary">
                <ul className="m-0 list-disc pl-4">
                  {summary.goodFor.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}

          {summary.setupDifficulty ? (
            <>
              <dt className="text-text-faint">Setup</dt>
              <dd className="m-0 text-text-secondary">{DIFFICULTY_LABEL[summary.setupDifficulty]}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <p className="m-0 mt-3 text-[11px] leading-relaxed text-text-faint">
        Written by AI from the README and description, so it can be wrong — check the README before relying on it.
        Generated <time dateTime={generatedAt}>{formatRelativeTime(generatedAt)}</time>.
      </p>
    </div>
  );
}
