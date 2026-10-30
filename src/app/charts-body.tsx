import { Suspense } from "react";

import { CHARTS_ROUTE, EARLY_CHARTS_READ } from "@/lib/charts-client";

import { ChartScreenLoader } from "./chart-screen-loader";

// Starts the chart read while the page is still parsing, beside the JavaScript
// rather than after hydration. The loader takes over this same request, so
// there is one download; a preload link was tried and Chrome fetched twice.
// The no-op catch keeps an early failure from reporting as unhandled before the
// loader attaches its own handling.
const earlyRead = `window.${EARLY_CHARTS_READ}=fetch(${JSON.stringify(CHARTS_ROUTE)});window.${EARLY_CHARTS_READ}.catch(function(){});`;

// The one body both chart routes (`/` and `/c/[code]`) render. It carries no
// chart data, so a crawl's revalidation never rebuilds these pages; the browser
// reads the chart file from its own route instead (ADR-0021). The country
// travels through the URL: ChartScreen resolves it from usePathname /
// useSearchParams, the same channel that follows client-side rewrites. The
// Suspense boundary holds both the useSearchParams consumer and the read.
export function ChartsBody() {
  return (
    <main className="min-h-dvh">
      <script dangerouslySetInnerHTML={{ __html: earlyRead }} />
      <Suspense>
        <ChartScreenLoader />
      </Suspense>
    </main>
  );
}
