import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Rule 30: robots.txt allows legitimate crawling and points at the
// sitemap, but is not the access-control layer for private routes —
// those are also blocked from indexing individually and, most
// importantly, authorized server-side.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/auth", "/login"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
