// devtunnel-backend/src/lib/ai/scoring.ts
import { mapGithubTopicsToTechStack } from "../techTopics";

/**
 * Shared keyword / tech-stack scoring used by AI search (Parts 2 and 3).
 * It is ALSO the non-AI fallback: when every AI provider fails, plain
 * keyword search over the same items still returns honest results
 * (Part 1 rule 6 — never fake a result).
 */

export interface ScorableItem {
  name: string;
  description?: string | null;
  topics?: string[];
  techStack?: string[];
  language?: string | null;
}

const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "with", "to", "of", "in", "on", "my", "me", "i", "want", "need",
  "find", "show", "some", "any", "project", "projects", "tool", "tools", "using", "that", "is", "are",
  "something", "looking", "good", "best", "new", "open", "source", "app", "apps", "application", "repo", "repos",
  "will", "would", "can", "could", "should", "help", "helps", "helping", "please", "how", "what", "which", "who",
  "do", "does", "get", "make", "use", "it", "this", "these", "those", "about", "from", "at", "by", "as", "be",
  "we", "you", "your", "our", "us", "im", "ive", "like", "something", "anything", "thing", "things",
]);

const MAX_TERMS = 12;

/** Lower-cases, splits into search terms (keeps c++, c#, node.js style tokens), drops filler words, caps the count. */
export function tokenizeQuery(query: string): string[] {
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9+#.\-]+/)) {
    const term = raw.replace(/^[.\-]+|[.\-]+$/g, "");
    if (term.length < 2 || STOPWORDS.has(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/**
 * Does `text` contain `term`? Terms of 3 characters or fewer ("ui", "ux",
 * "go", "c#") must match a WHOLE word: as substrings they hit unrelated
 * text ("ux" is inside "linux", "ui" inside "build"), which is how a
 * search for UI/UX design once returned Linux kernel exploits.
 */
function containsTerm(text: string, term: string): boolean {
  if (term.length > 3) return text.includes(term);
  return text.split(/[^a-z0-9+#]+/).includes(term);
}

/** Canonical tech-stack names (per techTopics.ts) mentioned by the query's terms. */
export function detectTechStack(terms: string[]): string[] {
  return mapGithubTopicsToTechStack(terms, null);
}

/**
 * Weighted term hits: name 5, tech stack / topics / language 3, description 1
 * (each term counts once per field), plus a +4 coverage bonus for every
 * distinct query term matched beyond the first — an item that matches BOTH
 * "react" and "todo" must outrank one that only has "todo" in its name.
 * Zero means "no keyword overlap at all".
 */
export function scoreItem(item: ScorableItem, terms: string[]): number {
  const name = item.name.toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  const tags = [...(item.techStack ?? []), ...(item.topics ?? []), item.language ?? ""].map((t) => t.toLowerCase());
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let hit = false;
    if (containsTerm(name, term)) {
      score += 5;
      hit = true;
    }
    if (tags.some((tag) => tag === term || containsTerm(tag, term))) {
      score += 3;
      hit = true;
    }
    if (containsTerm(description, term)) {
      score += 1;
      hit = true;
    }
    if (hit) matched++;
  }
  if (matched > 1) score += 4 * (matched - 1);
  return score;
}

/** Ranks items by score (stable for ties), dropping items below `minScore`. */
export function rankItems<T extends ScorableItem>(
  items: T[],
  query: string,
  options: { limit?: number; minScore?: number } = {},
): Array<{ item: T; score: number }> {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const minScore = options.minScore ?? 1;
  const scored = items
    .map((item, index) => ({ item, score: scoreItem(item, terms), index }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, options.limit ?? 20).map(({ item, score }) => ({ item, score }));
}

// ---------------------------------------------------------------------------
// Ranking helpers shared by every AI search endpoint (Parts 2 and 3)
// ---------------------------------------------------------------------------

/**
 * The part of an AI search interpretation ranking needs (a structural subset
 * of `AiSearchInterpretation` in ./searchInterpretation.ts, kept here so this
 * file stays free of request/handler code).
 */
export interface RankingTerms {
  keywords: string[];
  techStack: string[];
  languages: string[];
}

export interface RankOptions<T> {
  limit: number;
  /** Rows scoring below this are noise and are dropped. */
  minScore: number;
  /** Breaks score ties before falling back to the list's own order (e.g. stars, for the GitHub catalogs). */
  tieBreak?: (a: T, b: T) => number;
}

/**
 * Ranks rows for a model's interpretation of a request. Built on
 * `scoreItem` (name 5 / tags 3 / description 1 + coverage bonus) with two
 * additions that only make sense once the model has separated the request
 * into parts:
 *  - +6 for each requested tech-stack tag the row actually carries;
 *  - +4 for a matching primary language, but ONLY alongside some other
 *    signal (or when the request named nothing else) — otherwise "python"
 *    would surface every Python row regardless of topic.
 * Ties break on `options.tieBreak`, then on the input order (stable).
 *
 * Moved here from lib/githubCatalogAiSearch.ts in Part 3 so the GitHub
 * catalogs and the DevTunnel lists rank identically; the GitHub wrapper
 * `rankByInterpretation` still exists and behaves exactly as before.
 */
export function rankByTerms<T>(
  rows: T[],
  terms: RankingTerms,
  toScorable: (row: T) => ScorableItem,
  options: RankOptions<T>,
): T[] {
  const techLower = terms.techStack.map((t) => t.toLowerCase());
  const searchTerms = [...terms.keywords];
  for (const tech of techLower) if (!searchTerms.includes(tech)) searchTerms.push(tech);
  const onlyLanguage = terms.keywords.length === 0 && terms.techStack.length === 0;

  const scored: Array<{ row: T; score: number; index: number }> = [];
  rows.forEach((row, index) => {
    const scorable = toScorable(row);
    let signal = searchTerms.length ? scoreItem(scorable, searchTerms) : 0;
    const rowTech = new Set((scorable.techStack ?? []).map((t) => t.toLowerCase()));
    for (const tech of techLower) if (rowTech.has(tech)) signal += 6;

    let score = signal;
    const language = scorable.language?.toLowerCase() ?? "";
    if (language && terms.languages.includes(language) && (signal > 0 || onlyLanguage)) score += 4;

    if (score >= options.minScore) scored.push({ row, score, index });
  });

  scored.sort(
    (a, b) => b.score - a.score || (options.tieBreak ? options.tieBreak(a.row, b.row) : 0) || a.index - b.index,
  );
  return scored.slice(0, options.limit).map((entry) => entry.row);
}

/**
 * The non-AI path: plain keyword scoring over the prompt's own words.
 * Same result as `rankItems` (score descending, input order for ties) but
 * returns the caller's rows directly instead of wrapper objects.
 */
export function rankByPromptKeywords<T>(
  rows: T[],
  prompt: string,
  toScorable: (row: T) => ScorableItem,
  options: { limit: number; minScore?: number },
): T[] {
  const terms = tokenizeQuery(prompt);
  if (terms.length === 0) return [];
  const minScore = options.minScore ?? 1;
  const scored: Array<{ row: T; score: number; index: number }> = [];
  rows.forEach((row, index) => {
    const score = scoreItem(toScorable(row), terms);
    if (score >= minScore) scored.push({ row, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, options.limit).map((entry) => entry.row);
}