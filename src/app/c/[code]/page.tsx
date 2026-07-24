import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChartsBody } from "@/app/charts-body";
import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/country-code";

// Daily, not hourly like the home page: this timer is only the fallback
// behind tag revalidation, and it is multiplied by 63 routes — an hourly
// timer here would put the fleet's worst case back above the free FOT cap.
export const revalidate = 86400;

// Every country page is built ahead of time; an unknown code 404s from the CDN
// instead of invoking a per-request render, the cost ADR-0018 removed.
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRIES.map(({ code }) => ({ code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const entry = countryByCode(code);
  if (!entry) notFound();

  const title = `${entry.name} — Top 25 on Sounds Abroad`;
  const description = `What ${entry.name} is listening to right now. Charts from Apple Music, updated daily.`;
  const landscape = `/og?cc=${code}`;
  const square = `/og?cc=${code}&shape=square`;

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

export { ChartsBody as default };
