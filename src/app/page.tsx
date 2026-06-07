import { connection } from "next/server";

import { fetchCharts } from "@/lib/charts-client";
import { randomCountryCode } from "@/lib/landing-code";

import { ChartScreen } from "./chart-screen";

export default async function Home() {
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    throw new Error("CHARTS_BLOB_URL is not configured");
  }

  await connection();
  const charts = await fetchCharts(url);
  const defaultCountryCode = randomCountryCode(Object.keys(charts.countries));

  return (
    <main className="min-h-dvh">
      <ChartScreen charts={charts} defaultCountryCode={defaultCountryCode} />
    </main>
  );
}
