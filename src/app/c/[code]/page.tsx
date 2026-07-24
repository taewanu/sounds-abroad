import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { chartPageMetadata } from "@/app/chart-page-metadata";
import { ChartsBody } from "@/app/charts-body";
import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/country-code";

// Daily, not hourly like the home page: this timer is only the fallback
// behind tag revalidation, and it multiplies across every country route, so
// an hourly timer would put the fleet's worst case back above the free FOT
// cap (ADR-0019).
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
  // Unreachable at runtime (dynamicParams=false builds only known codes);
  // kept as the type narrowing for `entry`.
  if (!entry) notFound();

  return chartPageMetadata({
    title: `${entry.name} — Top 25 on Sounds Abroad`,
    description: `What ${entry.name} is listening to right now. Charts from Apple Music, updated daily.`,
    ogQuery: `?cc=${code}`,
  });
}

export { ChartsBody as default };
