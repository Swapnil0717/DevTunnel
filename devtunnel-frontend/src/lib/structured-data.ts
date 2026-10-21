import {
  CONTACT_EMAIL,
  PROJECT_GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/config";
import { LANDING_FAQ } from "@/lib/landing-faq";

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
 * Ownership (rule 53): the homepage emits `Organization`, `WebSite`,
 * `WebApplication` and `FAQPage`; every
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
    // The public repository is the project's own profile elsewhere on the web.
    sameAs: [PROJECT_GITHUB_URL],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      availableLanguage: "English",
    },
  };
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

/**
 * The DevTunnel web app itself. Every value mirrors what the homepage says:
 * free to use, MIT licensed, matches tasks to role/level/tech stack, and the
 * `dev` CLI opens the pull request. No ratings or counts (rules 47, 58).
 */
export function webApplicationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Open source tasks matched to your role, level and tech stack",
      "Plain-language explanation of each task",
      "Works on any public GitHub issue",
      "dev CLI that starts the work and opens the pull request",
      "Browse projects, tasks and tools without an account",
    ],
  };
}

/**
 * FAQPage built from the same list the homepage FAQ renders
 * (`lib/landing-faq.ts`), so the markup matches the visible text exactly.
 */
export function faqJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer.replace(/`/g, ""),
      },
    })),
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


/**
 * A guide or explainer page. Author and publisher are DevTunnel itself, and no
 * publish/modified dates are emitted: the site doesn't track them, and
 * inventing them would be "faking freshness" (rule 47).
 */
export function articleJsonLd({
  headline,
  description,
  path,
}: {
  headline: string;
  description: string;
  path: string;
}): JsonLdObject {
  const url = `${SITE_URL}${path}`;
  const organization = {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
  };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: `${SITE_URL}/og-image.jpg`,
    inLanguage: "en",
    author: organization,
    publisher: organization,
  };
}

/** The About page: says what DevTunnel is, with the Organization as its subject. */
export function aboutPageJsonLd({ description }: { description: string }): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${SITE_NAME}`,
    url: `${SITE_URL}/about`,
    description,
    inLanguage: "en",
    about: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}
