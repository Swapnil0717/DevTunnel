interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /**
   * Marks a choice as not yet available — e.g. "Start an open source
   * project" while project onboarding is an Admin-only, mandatory-review
   * workflow (Admin Portal Master Coding Specification: GitHub remains
   * the source of truth and Admin curates/publishes the DevTunnel
   * representation, not individual contributors). Renders the same
   * disabled + "Soon" badge treatment as `AdminSidebar` uses for routes
   * that don't exist yet, so the convention reads the same everywhere in
   * the app. Defaults to `false` so every existing call site is
   * unaffected.
   */
  disabled?: boolean;
}

/**
 * Single-select option used for developer role, experience level, and
 * contributor intent (3_devtunnel_onboarding.html). Rendered as a real
 * `<button role="radio">` inside a `role="radiogroup"` container (see call
 * sites) so it's keyboard-operable and announced correctly — never a bare
 * `<div onClick>` standing in for a real control
 * (Frontend_Development_Rules.txt rules 35 & 37).
 *
 * A `disabled` option renders `aria-disabled` (not the native `disabled`
 * attribute) plus `tabIndex={-1}`: it still needs to be readable and
 * discoverable by assistive tech and crawlers as a real, visible choice
 * that exists but isn't selectable yet — a genuinely `disabled` button
 * is often skipped by screen readers entirely, which would silently
 * hide the option instead of explaining why it can't be picked
 * (Frontend_Development_Rules.txt rule 35 — buttons must have correct,
 * discoverable meaning).
 */
export function OptionCard({
  label,
  description,
  selected,
  onSelect,
  disabled = false,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      title={disabled ? `${label} isn't available yet` : undefined}
      onClick={disabled ? undefined : onSelect}
      className={`w-full rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        disabled
          ? "cursor-not-allowed border-border-subtle bg-surface/60 text-text-faint"
          : selected
            ? "border-accent bg-surface-selected text-status-success-label"
            : "border-border bg-surface text-text-muted hover:border-border-subtle"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {disabled ? (
          <span className="shrink-0 rounded-full border border-border-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-faint">
            Soon
          </span>
        ) : null}
      </span>
      {description ? (
        <span className="mt-0.5 block text-[11px] text-text-dim">{description}</span>
      ) : null}
    </button>
  );
}