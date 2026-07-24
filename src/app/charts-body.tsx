import { Suspense } from "react";

import { fetchCharts } from "@/lib/charts-client";

import { ChartScreen } from "./chart-screen";

// The one body both chart routes (`/` and `/c/[code]`) render. The country
// itself travels through the URL: ChartScreen resolves it from usePathname /
// useSearchParams, the same channel that follows client-side rewrites, so the
// routes pass nothing down. The Suspense boundary is what lets a static route
// hold a useSearchParams consumer.
export async function ChartsBody() {
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    throw new Error("CHARTS_BLOB_URL is not configured");
  }

  const charts = await fetchCharts(url);

  return (
    <main className="min-h-dvh">
      <Suspense>
        <ChartScreen charts={charts} />
      </Suspense>
    </main>
  );
}
