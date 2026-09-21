/**
 * Dot color for a project's primary language/technology on Home's
 * recommended-project cards (the small colored circle before "TypeScript").
 *
 * Colors are GitHub's own language colors, so the dot matches what
 * contributors already see on GitHub. It only *decorates* a value the API
 * already returned — the language name always appears beside it as text, so
 * nothing is conveyed by color alone (rule 43) — and anything not listed
 * falls back to a neutral gray instead of guessing a color (rule 58).
 *
 * `getTechTagClasses` (`tag-style.ts`) is the separate, chip-style treatment
 * the other pages use; the redesigned Home card uses a dot instead.
 */
const TECH_COLORS: Record<string, string> = {
  typescript: "#3178C6",
  javascript: "#F1E05A",
  python: "#3572A5",
  rust: "#DEA584",
  go: "#00ADD8",
  java: "#B07219",
  kotlin: "#A97BFF",
  swift: "#F05138",
  dart: "#00B4AB",
  c: "#8A8A8A",
  "c++": "#F34B7D",
  "c#": "#178600",
  ruby: "#CC342D",
  php: "#4F5D95",
  scala: "#C22D40",
  elixir: "#6E4A7E",
  shell: "#89E051",
  html: "#E34C26",
  css: "#7B5CC2",
  vue: "#41B883",
  svelte: "#FF3E00",
  react: "#61DAFB",
  "next.js": "#E5E5E5",
  nextjs: "#E5E5E5",
};

export const FALLBACK_TECH_COLOR = "#6B6B6B";

export function getTechDotColor(primaryTech: string): string {
  return TECH_COLORS[primaryTech.trim().toLowerCase()] ?? FALLBACK_TECH_COLOR;
}
