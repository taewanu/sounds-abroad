"use client";

import { use, useSyncExternalStore } from "react";
import * as Sentry from "@sentry/nextjs";

import type { ChartFile } from "@/lib/chart-schema";
import {
  CHARTS_READ_TIMEOUT_MS,
  CHARTS_ROUTE,
  EARLY_CHARTS_READ,
} from "@/lib/charts-client";
import { startChartsRead } from "@/lib/start-charts-read";

import { ChartScreen } from "./chart-screen";

declare global {
  interface Window {
    [EARLY_CHARTS_READ]?: Promise<Response>;
  }
}

let chartsRead: Promise<ChartFile | null> | null = null;

// One read per visit: every country arrives together, so a later country
// change reads memory, not the network (ADR-0016). The page's inline script has
// usually started it already; fetching here covers a page that lacks it. Null
// stands for a failed read, which the screen renders rather than throws.
function readCharts(): Promise<ChartFile | null> {
  chartsRead ??= (
    window[EARLY_CHARTS_READ] ??
    startChartsRead(CHARTS_ROUTE, CHARTS_READ_TIMEOUT_MS, EARLY_CHARTS_READ)
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`charts: ${res.status}`);
      // The route serves fetchCharts output, already schema-checked server-side.
      return (await res.json()) as ChartFile;
    })
    .catch((err: unknown) => {
      Sentry.captureException(err);
      return null;
    });
  return chartsRead;
}

const emptySubscribe = () => () => {};

export function ChartScreenLoader() {
  // The read is the browser's: a relative URL has no origin to resolve against
  // during prerender, and the page must stay free of chart data (ADR-0021).
  const inBrowser = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return null;

  const charts = use(readCharts());
  if (charts === null) {
    // A reload, not a re-render: the failed read is kept for the visit, so only
    // a fresh page asks again.
    return (
      <div
        role="alert"
        className="bg-void/55 text-fg-2 ring-aurora/40 fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),16px)] z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg ring-1 backdrop-blur"
      >
        <span>Charts didn’t load</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-aurora focus-visible:outline-aurora rounded-full px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }
  return <ChartScreen charts={charts} />;
}
