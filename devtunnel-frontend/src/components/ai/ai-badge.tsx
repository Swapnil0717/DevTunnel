import { SparkleIcon } from "@/components/layout/nav-icons";

/**
 * Small "AI-generated" label for anything a model produced (Part 1 rule 9:
 * AI content is always labelled). Text plus an icon, never colour alone.
 * Shared by every AI feature (search, summaries, explanations, insights).
 */
export function AiBadge({ label = "AI-generated" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-text-dim">
      <SparkleIcon className="h-3 w-3" />
      {label}
    </span>
  );
}
