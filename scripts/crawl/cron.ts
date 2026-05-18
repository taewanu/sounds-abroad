import "./sentry-init";
import * as Sentry from "@sentry/nextjs";

import { COUNTRIES } from "../../src/lib/countries";

import { fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { triggerRevalidate } from "./revalidate-trigger";
import { crawlAll } from "./run";
import { createThrottle } from "./throttle";
import { uploadCharts } from "./upload-blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN missing.");
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
        fetchRss: fetchAppleRss,
        lookupTrack,
        throttle: createThrottle(),
        uploadCharts,
        triggerRevalidate,
      });
      const countries = Object.values(result.chartFile.countries);
      Sentry.captureMessage("charts:published", {
        level: "info",
        extra: {
          run_id: process.env.GITHUB_RUN_ID,
          country_count: countries.length,
          valid_count: countries.filter((c) => c.valid).length,
          blob_url: result.url,
        },
      });
    },
    {
      schedule: { type: "crontab", value: "0 4,11,16,22 * * *" },
      timezone: "UTC",
      checkinMargin: 5,
      maxRuntime: 90,
    },
  );
} finally {
  await Sentry.flush(5000);
}
