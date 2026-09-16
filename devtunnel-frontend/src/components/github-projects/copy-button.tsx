"use client";

import { useState } from "react";

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="1.6" />
      <path d="M6 15H5a1.6 1.6 0 0 1-1.6-1.6V5A1.6 1.6 0 0 1 5 3.4h8.4A1.6 1.6 0 0 1 15 5v1" />
    </svg>
  );
}

function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

/**
 * Small icon-only "copy to clipboard" button, used next to the clone
 * command and the share link on `GithubProjectSidebar`. Swaps to a
 * checkmark for ~1.8s after a successful copy so the person gets real
 * feedback that something happened, then reverts — same "confirm, then
 * quietly revert" pattern a native OS copy affordance uses, rather than
 * a toast/alert for something this low-stakes.
 *
 * Fails silently if the Clipboard API is unavailable (older browser, or
 * an insecure/non-HTTPS context where `navigator.clipboard` doesn't
 * exist) — the value is still fully visible in the field next to this
 * button, so a person can always select and copy it by hand instead.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // See doc comment above — intentionally silent.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${label} — copied` : label}
      className="inline-flex shrink-0 items-center justify-center rounded-[6px] p-1.5 text-text-faint transition-colors hover:bg-surface-raised hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-accent" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
