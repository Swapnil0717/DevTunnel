import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

// Only the truly public pages built in this pass belong here. As public
// content (docs, projects, developer profiles, ...) is added, it should
// register itself here too — never the private auth/app-shell routes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
