import { Suspense } from "react";

import { fetchCharts } from "@/lib/charts-client";

import { ChartScreen } from "./chart-screen";

export default async function Home() {
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    throw new Error("CHARTS_BLOB_URL is not configured");
  }

  const charts = await fetchCharts(url);

  return (
    <main className="min-h-dvh">
      <Suspense fallback={null}>
        <ChartScreen charts={charts} />
      </Suspense>
    </main>
  );
}
