import "./sentry-init";
import * as Sentry from "@sentry/node";

import { COUNTRIES } from "../../src/lib/countries";

import { AppleRssError, fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
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
        lookupTrack,
        throttle: createThrottle(),
        uploadCharts,
        triggerRevalidate,
        fetchPrevious: previousUrl
          ? () => fetchPublishedCharts(previousUrl)
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
      // Observed GHA dispatch delays up to 60min post-:17 (n=2, #26).
      // 90 = observed ceiling + 30min buffer.
      checkinMargin: 90,
      maxRuntime: 90,
    },
  );
} finally {
  await Sentry.flush(5000);
}
