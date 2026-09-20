/**
 * Small on/off switch — no equivalent exists yet in components/ui, so
 * this is the first one (styled from the same `accent`/`border`/`surface`
 * tokens every other control in the app uses, not a new palette).
 * A real checkbox under the hood (not a styled `<button>`) so it keeps
 * native keyboard/label/focus behavior for free.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required since this control has no visible text of its own. */
  label: string;
}) {
  return (
    <label
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-border bg-surface-raised transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[3px] h-[16px] w-[16px] rounded-full bg-text-muted transition-all peer-checked:left-[19px] peer-checked:bg-accent-foreground"
      />
    </label>
  );
}
