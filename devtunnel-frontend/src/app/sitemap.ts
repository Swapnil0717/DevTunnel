import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { getPublicCatalogUrls } from "@/lib/sitemap-sources";

// Rebuilt at most hourly — a newly published project becomes discoverable
// without a redeploy (Frontend_Development_Rules.txt rule 29).
export const revalidate = 3600;

/**
 * `/sitemap.xml` — valid, canonical, public, indexable URLs only (rules 29,
 * 8, 24).
 *
 * Included:
 *  - the homepage;
 *  - each DevTunnel catalog index (`/projects`, `/opensource-tools`,
 *    `/tasks`) and every project, tool and task page — but only when the
 *    backend actually serves that list to an anonymous request (see
 *    `lib/sitemap-sources.ts`), so the sitemap never advertises a page a
 *    crawler would be bounced away from.
 *
 * Deliberately left out:
 *  - private/app routes (`/login`, `/home`, `/profile`, `/settings`,
 *    `/admin`, ...) — rule 18;
 *  - `/projects/:slug/contribute` and `/projects/:slug/tasks/:id/contribute`
 *    — the same "how to contribute" view repeated per project, marked
 *    `noindex` (rule 24);
 *  - the GitHub-wide catalogs (`/github-projects`, `/github-open-source-tools`,
 *    and their `/:slug` pages) and `/issues` — mirrors/aggregations of
 *    third-party GitHub data, marked `noindex` (rule 24).
 *
 * No `lastModified` is emitted: the list endpoints don't return a
 * trustworthy per-URL modification date, and inventing one would be
 * "faking freshness" (rule 47).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getPublicCatalogUrls();

  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];

  const sections: Array<{ index: string; urls: string[] | null; priority: number }> = [
    { index: "/projects", urls: catalog.projects, priority: 0.8 },
    { index: "/opensource-tools", urls: catalog.tools, priority: 0.8 },
    { index: "/tasks", urls: catalog.tasks, priority: 0.7 },
  ];

  for (const { index, urls, priority } of sections) {
    if (!urls) continue;

    entries.push({ url: `${SITE_URL}${index}`, changeFrequency: "daily", priority });

    for (const path of urls) {
      entries.push({ url: `${SITE_URL}${path}`, changeFrequency: "weekly", priority: priority - 0.1 });
    }
  }

  return entries;
}
