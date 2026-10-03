// devtunnel-frontend/src/components/admin/sponsors/sponsor-form-fields.tsx
import type { ReactNode } from "react";
import { AdminSponsorsApiError } from "@/lib/admin/sponsors/client-api";

/** Shared styling for the sponsor admin forms (same look as the post-PR feedback box). */
export const INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface-raised px-2.5 py-2 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

export const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-[8px] bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/** A labelled form control. `children` must be the control with `id={id}`. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="m-0 mt-1 text-[11px] text-text-faint">{hint}</p> : null}
    </div>
  );
}

/** A real checkbox with a visible label and optional hint. */
export function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
      />
      <label htmlFor={id} className="text-[12.5px] text-text">
        {label}
        {hint ? <span className="block text-[11px] text-text-faint">{hint}</span> : null}
      </label>
    </div>
  );
}

/**
 * Text for a failed admin sponsors call. A 4xx carries the backend's own,
 * human-written message (a validation problem the admin can fix); anything
 * else (network, 5xx) gets the caller's generic fallback.
 */
export function sponsorErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AdminSponsorsApiError && err.status >= 400 && err.status < 500) return err.message;
  return fallback;
}
