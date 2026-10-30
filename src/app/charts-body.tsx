import { Suspense } from "react";

import { ChartScreenLoader } from "./chart-screen-loader";

// The one body both chart routes (`/` and `/c/[code]`) render. It carries no
// chart data, so a crawl's revalidation never rebuilds these pages; the browser
// reads the chart file from its own route instead (ADR-0021). The country
// travels through the URL: ChartScreen resolves it from usePathname /
// useSearchParams, the same channel that follows client-side rewrites. The
// Suspense boundary holds both the useSearchParams consumer and the read.
export function ChartsBody() {
  return (
    <main className="min-h-dvh">
      <Suspense>
        <ChartScreenLoader />
      </Suspense>
    </main>
  );
}
