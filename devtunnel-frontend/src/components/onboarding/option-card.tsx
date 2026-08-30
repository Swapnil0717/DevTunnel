interface OptionCardProps {
    label: string;
    description?: string;
    selected: boolean;
    onSelect: () => void;
  }
  
  /**
   * Single-select option used for developer role, experience level, and
   * contributor intent (3_devtunnel_onboarding.html). Rendered as a real
   * `<button role="radio">` inside a `role="radiogroup"` container (see call
   * sites) so it's keyboard-operable and announced correctly — never a bare
   * `<div onClick>` standing in for a real control
   * (Frontend_Development_Rules.txt rules 35 & 37).
   */
  export function OptionCard({ label, description, selected, onSelect }: OptionCardProps) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={`w-full rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          selected
            ? "border-accent bg-surface-selected text-status-success-label"
            : "border-border bg-surface text-text-muted hover:border-border-subtle"
        }`}
      >
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] text-text-dim">{description}</span>
        ) : null}
      </button>
    );
  }
  