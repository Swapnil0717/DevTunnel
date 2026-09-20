import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";

interface BuildMetadataOptions {
  /** Page-specific title. Rendered through the root title template. */
  title: string;
  /** Unique, page-specific description (rule 7 — never reuse across pages). */
  description: string;
  /** Path starting with "/", used to build the canonical + OG URL. */
  path: string;
  /**
   * Keep this page out of search results. Two distinct reasons use it:
   *
   *  - private / authenticated-only pages (login, callback, dashboard,
   *    profile, ...) must never be indexed (rule 18);
   *  - public pages that shouldn't be *indexed* even though anyone can open
   *    them: a page whose data failed to load (nothing but an error message
   *    — rule 23), a near-identical "how to contribute" view repeated per
   *    project, or a mirror of third-party GitHub content (rule 24).
   *
   * Public, content-bearing pages should omit this so they stay indexable.
   */
  noIndex?: boolean;
  /**
   * Whether crawlers may follow links on the page. Defaults to the opposite
   * of `noIndex` — a private page shouldn't be crawled through, while a
   * public-but-unindexed page (see `noIndex` above) still links to pages
   * that *should* be discovered, so pass `true` there.
   */
  followLinks?: boolean;
}

/**
 * Builds a Next.js `Metadata` object with a title, description, canonical
 * URL and Open Graph tags derived from a single set of inputs.
 *
 * This is the one place that knows how to turn a path into a canonical /
 * OG URL, so individual pages never construct those by hand (rule 51 —
 * keep SEO logic centralized; rule 52 — reusable SEO building blocks).
 */
export function buildMetadata({
  title,
  description,
  path,
  noIndex = false,
  followLinks,
}: BuildMetadataOptions): Metadata {
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: `${SITE_URL}/logo.png` }],
    },
    twitter: {
      card: "summary",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [`${SITE_URL}/logo.png`],
    },
    robots: {
      index: !noIndex,
      follow: followLinks ?? !noIndex,
    },
  };
}

export { SITE_DESCRIPTION, SITE_NAME, SITE_URL };
