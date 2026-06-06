import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

// Single entry: the page renders identical server HTML for every country (the
// selection is client state), so enumerating per-country URLs would be
// near-duplicate content. Per-country indexing is a later SEO slice.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      priority: 1,
    },
  ];
}
