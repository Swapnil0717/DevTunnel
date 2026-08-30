import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth flow + authenticated app shell must never be indexed
      // (Frontend_Development_Rules.txt rule 18). Page-level `noindex`
      // metadata (see lib/seo.ts) is the real enforcement; this disallow
      // just keeps crawlers from wasting budget on them.
      disallow: ["/login", "/auth/", "/dashboard", "/profile", "/onboarding"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
