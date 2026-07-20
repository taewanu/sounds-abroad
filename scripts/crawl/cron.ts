import "./sentry-init";
import * as Sentry from "@sentry/node";

import { COUNTRIES } from "../../src/lib/countries";
import {
  fetchCommentaryStore,
  withCommentaryDegradationSignal,
} from "../commentary/fetch-commentary";

import { fetchAppleRss } from "./apple-rss";
import { createItunesFetchers } from "./itunes-fetchers";
import { lookupTracks } from "./itunes-lookup";
import { fetchPublishedCharts } from "./published-charts";
import { triggerRevalidate } from "./revalidate-trigger";
import { crawlAll, summarizeValidity, type SpotifyResolution } from "./run";
import { createSpotifyResolver } from "./spotify-resolve";
import { createSpotifyThrottle, createThrottle } from "./throttle";
import { uploadCharts, uploadPreviousCharts } from "./upload-blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN missing.");
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Public URL of the last published payload, read back for carry-forward.
// Absent locally → carry-forward skipped.
const previousUrl = process.env.CHARTS_BLOB_URL;

// App-only Spotify credentials for resolving exact track deeplinks (ADR-0012).
// Both absent → Spotify links fall back to the search URL (no regression).
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotify: SpotifyResolution | undefined =
  spotifyClientId && spotifyClientSecret
    ? {
        resolve: createSpotifyResolver({
          clientId: spotifyClientId,
          clientSecret: spotifyClientSecret,
        }),
        throttle: createSpotifyThrottle(),
      }
    : undefined;
if (!spotify) {
  console.warn(
    "[crawl] SPOTIFY_CLIENT_ID/SECRET not set: Spotify links fall back to search URLs.",
  );
}

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
      const itunes = createItunesFetchers({
        fetchRss: fetchAppleRss,
        lookupTracks,
        throttle: createThrottle(),
        sleep,
      });
      const result = await crawlAll({
        countries: COUNTRIES,
        fetchRss: itunes.fetchRss,
        lookupTracks: itunes.lookupTracks,
        spotify,
        uploadCharts,
        // Never rejects: a lost snapshot generation only lags the movement
        // diff one run, which must not abort a finished crawl. It still pages,
        // because a silently dead snapshot is how the triggers went inert.
        uploadPrevious: async (chartFile) => {
          try {
            await uploadPreviousCharts(chartFile);
          } catch (err) {
            console.warn(
              `[crawl] prev snapshot write failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            Sentry.captureMessage("charts:prev-snapshot-failed", {
              level: "warning",
              extra: { run_id: process.env.GITHUB_RUN_ID },
            });
          }
        },
        triggerRevalidate,
        fetchPrevious: previousUrl
          ? () => fetchPublishedCharts(previousUrl)
          : undefined,
        // A configured store that reads back null means the bake silently
        // skips and freshly-crawled cards ship without commentary, so the
        // degradation must surface in Sentry, not just the run log.
        fetchCommentary: commentaryUrl
          ? withCommentaryDegradationSignal(
              () => fetchCommentaryStore(commentaryUrl),
              () => {
                console.warn(
                  "[crawl] commentary store unreadable: bake skipped this run.",
                );
                Sentry.captureMessage("commentary:unavailable", {
                  level: "warning",
                  extra: { run_id: process.env.GITHUB_RUN_ID },
                });
              },
            )
          : undefined,
      });

      const summary = summarizeValidity(result.chartFile);
      Sentry.captureMessage("charts:published", {
        level: "info",
        extra: {
          run_id: process.env.GITHUB_RUN_ID,
          country_count: summary.total,
          valid_count: summary.validCount,
          carried_codes: result.carriedCodes,
          // Unthresholded on purpose; see LookupTally.
          lookups_requested: result.lookups.requested,
          lookups_resolved: result.lookups.resolved,
          blob_url: result.url,
        },
      });
      // Carried-forward entries republish stale data as valid, so validity
      // alone under-reports degradation: a run that carried anything is a
      // degraded run even when every published entry parses as healthy.
      if (summary.invalidCodes.length > 0 || result.carriedCodes.length > 0) {
        Sentry.captureMessage("charts:degraded", {
          level: "warning",
          extra: {
            run_id: process.env.GITHUB_RUN_ID,
            invalid_codes: summary.invalidCodes,
            carried_codes: result.carriedCodes,
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
