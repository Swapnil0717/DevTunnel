import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Rule 29: sitemap includes only canonical, public, indexable URLs — no
// admin, private, auth, duplicate, or redirect URLs. As public route
// modules (docs, projects, developers) are added, generate their entries
// here from real published data rather than hardcoding — see rule 48.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
