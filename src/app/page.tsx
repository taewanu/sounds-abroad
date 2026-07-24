import type { Metadata } from "next";

import { ChartsBody } from "./charts-body";

// Safety net alongside tag-based revalidation: the charts payload exceeds the
// data cache's 2MB item cap, so the tag path alone can't be trusted to refresh
// the cached page after a crawl.
export const revalidate = 3600;

const title = "Sounds Abroad — World music discovery";
const description = "Explore trending music around the world, on a 3D globe.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    title,
    description,
    images: [
      { url: "/og", width: 1200, height: 630 },
      { url: "/og?shape=square", width: 1200, height: 1200 },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og"],
  },
};

export { ChartsBody as default };
