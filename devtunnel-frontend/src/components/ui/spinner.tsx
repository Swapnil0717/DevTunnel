/**
 * Shared loading spinner for every async "wait" point in the app (AI
 * previews/validation, saving, creating, deleting, signing in/out, …).
 *
 * Uses `currentColor` for its stroke so it always matches whatever
 * text/foreground color it's dropped into — a spinner inside the
 * `bg-text text-bg` primary button renders in `bg` (dark-on-light), one
 * inside a muted secondary button renders in `text-muted`, etc. No color
 * prop needed; just set `className` on the parent or pass one through.
 */
 export function Spinner({ className, size = 14 }: { className?: string; size?: number }) {
    return (
      <svg
        className={className ? `animate-spin ${className}` : "animate-spin"}
        style={{ width: size, height: size }}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  
  /**
   * Spinner + label for an inline loading line — e.g. "Loading projects…"
   * while a step's data is being fetched. Replaces bare `<p>Loading…</p>`
   * placeholders with something that matches the rest of the UI.
   */
  export function InlineLoading({
    label,
    className,
  }: {
    label: string;
    className?: string;
  }) {
    return (
      <div
        className={
          className
            ? `flex items-center gap-2 text-[12.5px] text-text-dim ${className}`
            : "flex items-center gap-2 text-[12.5px] text-text-dim"
        }
      >
        <Spinner size={13} />
        <span>{label}</span>
      </div>
    );
  }
  
  /**
   * Larger, centered spinner for a full step/panel that's waiting on
   * something slower — e.g. an AI-generated preview. Takes over the
   * content area rather than sitting inline with a text line.
   */
  export function LoadingPanel({
    label,
    className,
  }: {
    label?: string;
    className?: string;
  }) {
    return (
      <div
        className={
          className
            ? `flex flex-col items-center justify-center gap-3 py-16 text-text-dim ${className}`
            : "flex flex-col items-center justify-center gap-3 py-16 text-text-dim"
        }
      >
        <Spinner size={26} />
        {label ? <p className="m-0 text-[12.5px]">{label}</p> : null}
      </div>
    );
  }