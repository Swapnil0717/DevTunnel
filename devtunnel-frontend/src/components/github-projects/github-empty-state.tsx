import Link from "next/link";

/**
 * A richer, on-brand replacement for the plain dashed `SectionMessage`
 * box used across the GitHub Projects / GitHub Open Source Tools
 * catalog:
 *
 * - `"projects"` / `"tools"` — the catalog list pages
 *   (`/github-projects`, `/github-open-source-tools`) when nothing has
 *   been added yet.
 * - `"no-results"` — a search/filter combo on those list pages that
 *   matched nothing, or either detail page's own "couldn't load this
 *   repository right now" failure state.
 * - `"readme"` — a repository detail page's README tab when GitHub
 *   reports no README for that repo.
 * - `"issues-clear"` — a repository detail page's Issues tab when the
 *   repository has zero open issues. Deliberately framed as a *good*
 *   result (checkmark, not a dashed "nothing here" box) — an empty
 *   issue queue is something to feel good about, not a gap to fill.
 *
 * Frontend-only: this never talks to the backend or invents any
 * repository data — it's purely a better-designed placeholder for the
 * moments a catalog or a single repository's tab has nothing to show,
 * each with its own small illustration, copy, and — where it actually
 * helps — a couple of real, working links elsewhere in the app or out to
 * GitHub itself.
 *
 * Kept as one component with a `variant` switch (rather than one-off
 * components per spot) so every one of these moments shares the same
 * card shape, spacing, and button styling, and only differs in
 * illustration + copy + actions.
 *
 * **Fix:** the icon used to sit in front of a blurred, glowing circle
 * (`blur-xl` over a solid accent-colored disc). Isolated on one card it
 * read as a subtle touch; repeated across every empty state in the app —
 * catalog lists, tab panels, the Community page's error state — it
 * turned into an unintentional signature look, the kind of glow that
 * reads as generated rather than designed. Replaced with a plain
 * bordered circle, which is what the rest of this app's icon treatments
 * already use (rule: consistency over decoration).
 */

type GithubEmptyStateVariant = "projects" | "tools" | "no-results" | "readme" | "issues-clear";

interface GithubEmptyStateAction {
  label: string;
  /** Internal route — rendered as a Next.js `Link`. Omit when using `onClick`. */
  href?: string;
  /** External URL — rendered as a plain anchor that opens in a new tab. */
  external?: boolean;
  /** For actions with no destination of their own, e.g. "Clear filters". */
  onClick?: () => void;
}

interface GithubEmptyStateProps {
  variant: GithubEmptyStateVariant;
  title: string;
  description: string;
  primaryAction?: GithubEmptyStateAction;
  secondaryAction?: GithubEmptyStateAction;
  /**
   * Compact spacing for tab panels that already sit inside their own
   * bordered card (`GithubProjectDetailTabs`'s README/Issues panels) —
   * the full-size padding and dashed border reads right on a bare page
   * background, but doubled-up borders and 56px of vertical padding
   * inside an already-bordered panel look like a mistake, not a design.
   */
  compact?: boolean;
}

export function GithubEmptyState({
  variant,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}: GithubEmptyStateProps) {
  const isPositive = variant === "issues-clear";

  return (
    <div
      className={
        compact
          ? "flex flex-col items-center px-4 py-8 text-center"
          : `flex flex-col items-center rounded-[14px] border border-dashed px-6 py-14 text-center ${
              isPositive ? "border-accent/25 bg-accent/[0.04]" : "border-border-subtle bg-surface/40"
            }`
      }
    >
      <div
        className={`mb-5 flex shrink-0 items-center justify-center rounded-full border ${
          isPositive ? "border-accent/30 bg-accent/[0.06]" : "border-border-subtle bg-surface-raised"
        } ${compact ? "h-14 w-14" : "h-20 w-20"}`}
        aria-hidden="true"
      >
        <GithubEmptyIllustration
          variant={variant}
          className={`text-text-faint ${isPositive ? "text-accent" : ""} ${compact ? "h-6 w-6" : "h-9 w-9"}`}
        />
      </div>

      <h2 className={`m-0 mb-1.5 font-medium text-text ${compact ? "text-[13px]" : "text-[14.5px]"}`}>
        {title}
      </h2>
      <p className={`m-0 max-w-sm leading-relaxed text-text-muted ${compact ? "text-[11.5px]" : "text-[12px]"}`}>
        {description}
      </p>

      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction ? <EmptyStateActionButton {...primaryAction} kind="primary" /> : null}
          {secondaryAction ? (
            <EmptyStateActionButton {...secondaryAction} kind="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyStateActionButton({
  label,
  href,
  external,
  onClick,
  kind,
}: GithubEmptyStateAction & { kind: "primary" | "secondary" }) {
  const className =
    kind === "primary"
      ? "inline-flex items-center gap-1.5 rounded-[8px] bg-accent px-4 py-2 text-[12px] font-medium text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      : "inline-flex items-center gap-1.5 rounded-[8px] border border-border px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-subtle hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  if (external && href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href ?? "#"} className={className}>
      {label}
    </Link>
  );
}

/**
 * Five small outline illustrations, same drawing convention
 * `components/layout/nav-icons.tsx` documents (plain inline SVG, no
 * icon-library dependency, `currentColor` stroke) — just larger and a
 * little more detailed since these carry a whole empty state rather
 * than sitting next to a nav label.
 */
function GithubEmptyIllustration({
  variant,
  className = "",
}: {
  variant: GithubEmptyStateVariant;
  className?: string;
}) {
  const base = {
    viewBox: "0 0 48 48",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (variant === "tools") {
    return (
      <svg {...base} className={className}>
        {/* Terminal window */}
        <rect x="5" y="9" width="38" height="30" rx="3" />
        <path d="M5 17h38" />
        <path d="M13 25l5 4-5 4" />
        <path d="M24 33h9" />
      </svg>
    );
  }

  if (variant === "no-results") {
    return (
      <svg {...base} className={className}>
        <circle cx="21" cy="21" r="13" />
        <path d="M30.5 30.5 41 41" />
        <path d="M16.5 21h9" />
      </svg>
    );
  }

  if (variant === "readme") {
    return (
      <svg {...base} className={className}>
        {/* Folded-corner document */}
        <path d="M12 5h16l8 8v27a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M28 5v8h8" />
        <path d="M16 26h16" />
        <path d="M16 32h10" />
      </svg>
    );
  }

  if (variant === "issues-clear") {
    return (
      <svg {...base} className={className}>
        <circle cx="24" cy="24" r="17" />
        <path d="M16.5 24.5l5 5 10-11" />
      </svg>
    );
  }

  // "projects" — an open repository with a star, matching the
  // stars/forks/issues language every GithubProjectCard already uses.
  return (
    <svg {...base} className={className}>
      <path d="M7 13a2 2 0 0 1 2-2h8l3 3h19a2 2 0 0 1 2 2v19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V13Z" />
      <path d="M24 19.5l1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6 1.8-3.7Z" />
    </svg>
  );
}
