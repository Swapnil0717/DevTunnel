import { CopyButton } from "@/components/github-projects/copy-button";
import { GitBranchIcon, IssueIcon, StarIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import type { SubmissionDetail } from "@/lib/submissions/types";

type IconProps = { className?: string };

function StatRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: (props: IconProps) => JSX.Element;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="inline-flex items-center gap-1.5 text-text-faint">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
        {label}
      </span>
      <span className="font-medium text-text-secondary">{value}</span>
    </div>
  );
}

const CARD_CLASS = "rounded-[10px] border border-border bg-surface p-4";
const CARD_HEADING_CLASS =
  "m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint";

/**
 * Right-hand rail of a submission's view page (`/submissions/:slug`):
 * who submitted it, the repository's live GitHub facts, and a share link.
 *
 * The GitHub panel is only rendered from real numbers. `submission.github`
 * is `null` when the row has no repository or GitHub couldn't be reached
 * just now, and in that case the panel says the stats are unavailable
 * rather than showing zeroes — a stars count of 0 would read as "nobody
 * has starred this", which nothing checked (rule 38, rule 58). Everything
 * else on the page is stored data and doesn't depend on it.
 *
 * "Submitted by" is here on purpose, not just in the header: this list
 * isn't curated by DevTunnel, and the person behind an entry is the fact
 * a viewer needs to weigh it.
 *
 * A plain `<img>` for the avatar, same as `AppSidebar`'s own — the URL is
 * whatever GitHub gave the submitter at sign-in, not a host worth pinning
 * in `next.config.mjs`.
 */
export function SubmissionDetailSidebar({
  submission,
  shareUrl,
}: {
  submission: SubmissionDetail;
  /** Absolute URL to this submission's own DevTunnel view page. */
  shareUrl: string;
}) {
  const { submittedBy, github } = submission;

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      <div className={CARD_CLASS}>
        <h2 className={CARD_HEADING_CLASS}>Submitted by</h2>
        <div className="flex items-center gap-2.5">
          {submittedBy.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar URL comes from the submitter's GitHub sign-in
            <img
              src={submittedBy.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full border border-border-subtle object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-avatar-placeholder-border bg-avatar-placeholder-bg text-[13px] font-medium text-avatar-placeholder-icon"
            >
              {(submittedBy.name || submittedBy.username).charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-text">
              {submittedBy.name ?? submittedBy.username}
            </div>
            {submittedBy.profileUrl ? (
              <a
                href={submittedBy.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate font-mono text-[11px] text-text-faint hover:text-accent"
              >
                @{submittedBy.username}
              </a>
            ) : (
              <div className="truncate font-mono text-[11px] text-text-faint">
                @{submittedBy.username}
              </div>
            )}
          </div>
        </div>
        <p className="m-0 mt-3 border-t border-border-subtle pt-3 text-[11.5px] text-text-faint">
          Submitted{" "}
          <time dateTime={submission.createdAt}>{formatRelativeTime(submission.createdAt)}</time>
          . Not reviewed or curated by DevTunnel.
        </p>
      </div>

      {submission.repositoryFullName ? (
        <div className={CARD_CLASS}>
          <h2 className={CARD_HEADING_CLASS}>Repository</h2>
          {github ? (
            <>
              <div className="flex flex-col gap-2">
                <StatRow
                  icon={StarIcon}
                  label="Stars"
                  value={`${github.stars.toLocaleString()} (${formatCompactNumber(github.stars)})`}
                />
                <StatRow icon={GitBranchIcon} label="Forks" value={github.forks.toLocaleString()} />
                <StatRow
                  icon={IssueIcon}
                  label="Open issues"
                  value={github.openIssuesCount.toLocaleString()}
                />
                <StatRow label="License" value={github.license ?? "Not specified"} />
              </div>
              <div className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-3 text-[11.5px] text-text-faint">
                <span>
                  Created{" "}
                  <time dateTime={github.createdAt}>{formatRelativeTime(github.createdAt)}</time>
                </span>
                <span>
                  Last push{" "}
                  <time dateTime={github.pushedAt}>{formatRelativeTime(github.pushedAt)}</time>
                </span>
              </div>
            </>
          ) : (
            <p className="m-0 text-[12px] leading-relaxed text-text-faint">
              GitHub&apos;s numbers for this repository aren&apos;t available right now. The rest
              of this page is what was submitted.
            </p>
          )}
        </div>
      ) : null}

      <div className={CARD_CLASS}>
        <h2 className={CARD_HEADING_CLASS}>Share</h2>
        <div className="flex items-center gap-1.5 rounded-[8px] border border-border-subtle bg-surface-raised px-2.5 py-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-text-secondary">
            {shareUrl}
          </code>
          <CopyButton value={shareUrl} label="Copy link to this page" />
        </div>
      </div>
    </aside>
  );
}
