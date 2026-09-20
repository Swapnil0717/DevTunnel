/**
 * Compact number formatting for GitHub-style counts — `12500` becomes
 * `"12.5K"`, matching how GitHub itself abbreviates star/fork counts.
 * Uses `Intl.NumberFormat`'s built-in "compact" notation rather than a
 * hand-rolled k/m suffix table, so it stays locale-correct and doesn't
 * need to enumerate every magnitude itself.
 *
 * Always paired with visible unit text where it's used
 * (`GithubProjectCard`'s `aria-label`s say "1.2K stars", never just the
 * bare number) — Frontend_Development_Rules.txt rule 43: a count alone
 * isn't a meaningful accessible fact on its own.
 */
 const compactFormatter = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  
  export function formatCompactNumber(value: number): string {
    return compactFormatter.format(value);
  }