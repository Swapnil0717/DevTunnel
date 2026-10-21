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
/** Areas no crawler (search or AI) should spend time on. */
const PRIVATE_AREAS = [
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
];

/**
 * AI assistants and AI search crawlers, named explicitly so the intent is
 * unambiguous: DevTunnel is a free, open source project and wants to be found
 * and cited. This list covers search/answer fetchers (OAI-SearchBot,
 * ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User,
 * DuckAssistBot) and the crawlers that also feed model training (GPTBot,
 * ClaudeBot, Google-Extended, Applebot-Extended, CCBot, ...). Delete a name
 * here to opt that crawler out.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "Meta-ExternalAgent",
  "DuckAssistBot",
  "MistralAI-User",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_AREAS },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE_AREAS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
