import { chartPageMetadata } from "./chart-page-metadata";
import { ChartsBody } from "./charts-body";

// Daily, like the country pages: the crawl's tag revalidation already refreshes
// this page, and every timed regeneration is an ISR write of the full charts
// payload.
export const revalidate = 86400;

export const metadata = chartPageMetadata({
  title: "Sounds Abroad — World music discovery",
  description: "Explore trending music around the world, on a 3D globe.",
});

export { ChartsBody as default };
