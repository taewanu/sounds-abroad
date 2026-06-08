import type { Metadata } from "next";
import { connection } from "next/server";

import { fetchCharts } from "@/lib/charts-client";
import { countryByCode, validateCountryCode } from "@/lib/country-code";
import { randomCountryCode } from "@/lib/landing-code";

import { ChartScreen } from "./chart-screen";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { cc } = await searchParams;
  const code = validateCountryCode(typeof cc === "string" ? cc : null);
  const entry = code ? countryByCode(code) : undefined;

  const title = entry
    ? `${entry.name} — Top 25 on Sounds Abroad`
    : "Sounds Abroad — World music discovery";
  const description = entry
    ? `What ${entry.name} is listening to right now. Charts from Apple Music, updated daily.`
    : "Explore trending music around the world, on a 3D globe.";

  const query = code ? `?cc=${code}` : "";
  const landscape = `/og${query}`;
  const squareSep = code ? "&" : "?";
  const square = `/og${query}${squareSep}shape=square`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [
        { url: landscape, width: 1200, height: 630 },
        { url: square, width: 1200, height: 1200 },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [landscape],
    },
  };
}

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
