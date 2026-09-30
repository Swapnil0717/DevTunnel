/**
 * Star-range buckets for `/github-projects`. Mirror of `STAR_BUCKETS` in
 * devtunnel-backend `src/routes/githubProjects.ts` — the `key` is the
 * `?filter=` value the backend accepts, and every bucket is its own GitHub
 * search (its own top-1,000 by stars, cached separately). Keep the two lists
 * in sync.
 *
 * Why buckets exist: the unfiltered catalog is a single GitHub query capped
 * at 1,000 rows (the most-starred ones), so a "Maximum stars" filter applied
 * in the browser had nothing low-star to show. Picking a star range now loads
 * the matching bucket(s) from the server instead.
 *
 * Bucket edges line up with the dropdown values in
 * `github-projects-explorer.tsx` (Minimum: 10/100/500/1,000/5,000/10,000,
 * Maximum "Under": 10/50/100/500/1,000), so every choice covers whole
 * buckets; the explorer still applies the exact min/max afterwards.
 */
 export interface StarBucket {
    /** `?filter=` value sent to the backend. */
    key: string;
    /** Lowest star count in the bucket (inclusive). */
    min: number;
    /** Highest star count in the bucket (inclusive); `Infinity` = open-ended. */
    max: number;
  }
  
  export const STAR_BUCKETS: readonly StarBucket[] = [
    { key: "stars-0-9", min: 0, max: 9 },
    { key: "stars-10-49", min: 10, max: 49 },
    { key: "stars-50-99", min: 50, max: 99 },
    { key: "stars-100-499", min: 100, max: 499 },
    { key: "stars-500-999", min: 500, max: 999 },
    { key: "stars-1000-4999", min: 1000, max: 4999 },
    { key: "stars-5000-9999", min: 5000, max: 9999 },
    { key: "stars-10000-plus", min: 10000, max: Number.POSITIVE_INFINITY },
  ];
  
  /**
   * The buckets that overlap the inclusive star range `[minStars, maxStars]`.
   * Empty when the range is unbounded on both sides (`0` .. `Infinity`) —
   * that's the plain catalog, no bucket needed.
   */
  export function bucketsForRange(minStars: number, maxStars: number): StarBucket[] {
    if (minStars <= 0 && maxStars === Number.POSITIVE_INFINITY) return [];
    return STAR_BUCKETS.filter((bucket) => bucket.min <= maxStars && bucket.max >= minStars);
  }
  