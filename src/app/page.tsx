import { chartPageMetadata } from "./chart-page-metadata";
import { ChartsBody } from "./charts-body";

// Safety net alongside tag-based revalidation: the charts payload exceeds the
// data cache's 2MB item cap, so the tag path alone can't be trusted to refresh
// the cached page after a crawl.
export const revalidate = 3600;

export const metadata = chartPageMetadata({
  title: "Sounds Abroad — World music discovery",
  description: "Explore trending music around the world, on a 3D globe.",
});

export { ChartsBody as default };
