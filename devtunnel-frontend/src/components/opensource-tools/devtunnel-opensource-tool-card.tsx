import { OpenSourceToolLogo } from "@/components/admin/opensource-tools/opensource-tool-logo";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { OpenSourceToolSummary } from "@/lib/opensource-tools/types";

/** How many label tags to show inline before collapsing into "+N" — same convention `GithubProjectCard` uses for `techStack`. */
const MAX_VISIBLE_LABELS = 3;

/** Strips the protocol and any trailing slash so a source URL reads like `github.com/owner/repo`, not `https://github.com/owner/repo/`. */
function formatSourceUrl(sourceUrl: string): string {
  return sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * One card on the `/opensource-tools` grid ("Open Source Tools on
 * Devtunnel" in `AppSidebar`) — the curated, DevTunnel-side counterpart
 * to `GithubProjectCard` on `/github-open-source-tools`
 * (`components/github-projects/github-project-card.tsx`), deliberately
 * styled to match it per the same design directive `/projects` already
 * followed against `/github-projects`: logo + name/source row, a
 * two-line description, a tag row, then a bordered footer.
 *
 * `OpenSourceToolLogo` is reused as-is rather than duplicated — already
 * a generic, role-agnostic presentational component (no admin API
 * calls, no admin-only state, just `name` + `sourceUrl`), same reuse
 * `GithubProjectCard`'s doc comment documents for `RepoLogo`
 * (Frontend_Development_Rules.txt rule 51).
 *
 * The whole card's primary click target is the tool name, which opens
 * the real source repository/site in a new tab — this is a read-only
 * curated catalog with no DevTunnel-side detail route of its own (no
 * `/opensource-tools/:slug` page exists), same reasoning
 * `GithubProjectCard` documents for why it links out instead of inward.
 *
 * Footer swaps `GithubProjectCard`'s stars/forks/issues row (real
 * GitHub-only fields `OpenSourceToolSummary` doesn't carry) for an
 * "Added <relative time>" timestamp off `createdAt` — the one real,
 * comparable fact this catalog has instead (Frontend_Development_Rules.txt
 * rule 58: never invent a stat to fill the same visual slot).
 */
export function DevtunnelOpenSourceToolCard({ tool }: { tool: OpenSourceToolSummary }) {
  const visibleLabels = tool.labels.slice(0, MAX_VISIBLE_LABELS);
  const hiddenLabelCount = tool.labels.length - visibleLabels.length;

  return (
    <article className="flex flex-col rounded-[10px] border border-border bg-surface p-4 transition-colors hover:border-border-subtle">
      <div className="mb-2.5 flex items-start gap-2.5">
        <OpenSourceToolLogo name={tool.name} sourceUrl={tool.sourceUrl} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-[13px] font-medium leading-tight text-text">
            <a
              href={tool.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-accent focus-visible:text-accent"
            >
              {tool.name}
            </a>
          </h3>
          <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-text-faint">
            {formatSourceUrl(tool.sourceUrl)}
          </p>
        </div>
      </div>

      <p className="m-0 mb-3 line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-text-secondary">
        {tool.description ?? "No description provided."}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {tool.primaryLanguage ? (
          <span
            className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10px] ${getTechTagClasses(tool.primaryLanguage)}`}
          >
            {tool.primaryLanguage}
          </span>
        ) : null}

        {visibleLabels.map((label) => (
          <span
            key={label}
            className="inline-block rounded-[5px] border border-border bg-surface-raised px-[7px] py-[2px] text-[10px] text-text-secondary"
          >
            {label}
          </span>
        ))}

        {hiddenLabelCount > 0 ? (
          <span className="text-[10px] text-text-faint">+{hiddenLabelCount}</span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
        <a
          href={tool.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[10.5px] font-medium text-text-faint hover:text-accent"
        >
          Visit tool
        </a>

        <p className="m-0 shrink-0 text-[10.5px] text-text-faint">
          Added <time dateTime={tool.createdAt}>{formatRelativeTime(tool.createdAt)}</time>
        </p>
      </div>
    </article>
  );
}
