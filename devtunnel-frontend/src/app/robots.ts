import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/**
 * Frontend_Development_Rules.txt rule 30: allow legitimate public crawling,
 * point at the sitemap, and keep crawlers out of private/application areas.
 *
 * The public catalog (`/projects`, `/tasks`, `/opensource-tools`, ... — see
 * `app/(public)/layout.tsx`) is deliberately NOT disallowed here: those
 * pages must be crawlable. Which of them are *indexed* is decided per page
 * with `noindex` metadata (`lib/seo.ts`) — and a disallowed URL can't be
 * fetched, so a crawler would never even see that `noindex`.
 *
 * This is crawl-budget hygiene only, never access control (rule 18): every
 * area listed below is also protected by a real, backend-confirmed session
 * check, and nothing private is meant to depend on this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Auth flow.
        "/login",
        "/auth/",
        // Signed-in app shell (`app/(protected)`).
        "/dashboard",
        "/home",
        "/profile",
        "/settings",
        "/onboarding",
        // Creating / editing a community submission needs an account;
        // viewing one (/submissions, /submissions/:slug) is public.
        "/submissions/new",
        "/submissions/*/edit",
        // Admin Portal — login and the authenticated shell behind it.
        "/admin",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
