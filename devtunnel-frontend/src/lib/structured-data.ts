import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";

/**
 * Schema.org JSON-LD builders — the one place structured data is described
 * (Frontend_Development_Rules.txt rules 14, 51, 52).
 *
 * Every value here is either a project constant (`lib/config.ts`) or comes
 * from the same record the page renders visibly, so the markup never claims
 * something the page doesn't show (rule 14), and nothing is invented —
 * no ratings, review counts, authors or dates the backend didn't supply
 * (rules 47, 58).
 *
 * Ownership (rule 53): the homepage emits `Organization` + `WebSite`; every
 * detail page emits only its own `BreadcrumbList`. Nothing else renders the
 * same object twice.
 */

export type JsonLdObject = Record<string, unknown>;

export interface BreadcrumbItem {
  /** Visible label — must match the breadcrumb text on the page. */
  name: string;
  /** Site-relative path starting with "/". */
  path: string;
}

/** DevTunnel itself — consistent name/URL/description everywhere (rules 15, 44). */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: SITE_DESCRIPTION,
  };
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
  };
}

/**
 * `Projects > Project A` — must list exactly the crumbs the page shows
 * (rule 14: structured data mirrors visible content), so callers pass the
 * same items they render; nothing is added implicitly.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
