import "./sentry-init";
import * as Sentry from "@sentry/node";

import { COUNTRIES } from "../../src/lib/countries";
import { fetchCommentaryStore } from "../commentary/fetch-commentary";

import { AppleRssError, fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { withLookupRetry } from "./lookup-retry";
import { fetchPublishedCharts } from "./published-charts";
import { withRetry } from "./retry";
import { triggerRevalidate } from "./revalidate-trigger";
import { crawlAll, summarizeValidity } from "./run";
import { createThrottle } from "./throttle";
import { uploadCharts } from "./upload-blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN missing.");
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Public URL of the last published payload, read back for carry-forward.
// Absent locally → carry-forward skipped.
const previousUrl = process.env.CHARTS_BLOB_URL;

// Session-owned commentary store, baked into the served charts when present.
// The crawl only reads it (ADR-0007). Absent → no commentary this run.
const commentaryUrl = process.env.COMMENTARY_BLOB_URL;
if (!commentaryUrl) {
  // Optional by design, so absence must not abort; warn so a missing wire
  // surfaces in the run output instead of silently skipping all commentary.
  console.warn(
    "[crawl] COMMENTARY_BLOB_URL not set: commentary will not be baked this run.",
  );
}

// Short-lived process: must flush before exit so the monitor check-in + the
// charts:published message actually reach Sentry. withMonitor returning is not
// the same as the events being transmitted.
try {
  await Sentry.withMonitor(
    "charts-crawl",
    async () => {
      const result = await crawlAll({
        countries: COUNTRIES,
        fetchRss: (cc) =>
          withRetry(() => fetchAppleRss(cc), {
            retries: 2,
            backoffMs: 500,
            sleep,
            shouldRetry: (err) => err instanceof AppleRssError,
          }),
        lookupTrack: withLookupRetry(lookupTrack, { sleep }),
        throttle: createThrottle(),
        uploadCharts,
        triggerRevalidate,
        fetchPrevious: previousUrl
          ? () => fetchPublishedCharts(previousUrl)
          : undefined,
        fetchCommentary: commentaryUrl
          ? () => fetchCommentaryStore(commentaryUrl)
          : undefined,
      });

      const summary = summarizeValidity(result.chartFile);
      Sentry.captureMessage("charts:published", {
        level: "info",
        extra: {
          run_id: process.env.GITHUB_RUN_ID,
          country_count: summary.total,
          valid_count: summary.validCount,
          blob_url: result.url,
        },
      });
      if (summary.invalidCodes.length > 0) {
        Sentry.captureMessage("charts:degraded", {
          level: "warning",
          extra: {
            run_id: process.env.GITHUB_RUN_ID,
            invalid_codes: summary.invalidCodes,
            valid_count: summary.validCount,
            country_count: summary.total,
          },
        });
      }
    },
    {
      schedule: { type: "crontab", value: "17 4,11,16,22 * * *" },
      timezone: "UTC",
      // GHA scheduled-dispatch delay is unbounded; observed p100 ~120min
      // over ~10 days. 150 = observed max + buffer, kept under the 300min
      // tightest slot gap so per-slot check-in windows stay disjoint.
      checkinMargin: 150,
      // Clocks from the in-progress check-in, not the slot, so dispatch
      // delay never eats into it. Sized to the throttled crawl runtime
      // (~26 requests/country at the 3s gap, ~80min at current coverage),
      // kept under the 300min tightest slot gap with checkinMargin.
      maxRuntime: 120,
    },
  );
} finally {
  await Sentry.flush(5000);
}
