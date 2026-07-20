import { COUNTRIES } from "../../src/lib/countries";
import { assertObjectStoreEnv } from "../lib/object-store";

import { fetchPlaylists } from "./apple-playlists";
import { fetchAppleRss } from "./apple-rss";
import { createItunesFetchers } from "./itunes-fetchers";
import { lookupTracks } from "./itunes-lookup";
import { fetchPlaylistPage } from "./playlist-page";
import { fetchPublishedCharts } from "./published-charts";
import { crawlAll, crawlCountry, type SpotifyResolution } from "./run";
import { createSpotifyResolver } from "./spotify-resolve";
import {
  createPlaylistPageThrottle,
  createSpotifyThrottle,
  createThrottle,
} from "./throttle";
import {
  uploadCharts,
  uploadPlaylistFile,
  uploadPreviousCharts,
} from "./upload-blob";

// Spotify resolution for local debug: enabled only when both credentials are in
// .env.local; otherwise links fall back to the search URL, same as production.
function spotifyFromEnv(): SpotifyResolution | undefined {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return {
    resolve: createSpotifyResolver({ clientId, clientSecret }),
    throttle: createSpotifyThrottle(),
  };
}

async function main(): Promise<void> {
  const cc = process.argv[2];
  if (cc) {
    await runSingleCountry(cc);
    return;
  }
  await runAllCountries();
}

async function runSingleCountry(cc: string): Promise<void> {
  const entry = COUNTRIES.find((c) => c.code === cc);
  if (!entry) {
    throw new Error(
      `Unknown country code "${cc}". Known: ${COUNTRIES.map((c) => c.code).join(", ")}`,
    );
  }

  const itunes = createItunesFetchers({
    fetchRss: fetchAppleRss,
    fetchPlaylists,
    lookupTracks,
    throttle: createThrottle(),
  });
  console.log(`[crawl ${cc}] starting single-country debug crawl...`);
  const { country } = await crawlCountry({
    cc,
    name: entry.name,
    fetchRss: itunes.fetchRss,
    lookupTracks: itunes.lookupTracks,
    spotify: spotifyFromEnv(),
  });
  console.log(
    `[crawl ${cc}] ${country.tracks.length} tracks (valid=${country.valid})`,
  );
  console.log("[crawl] (dry run: no upload, no revalidate)");
  console.log(JSON.stringify({ [cc]: country }, null, 2));
}

async function runAllCountries(): Promise<void> {
  assertObjectStoreEnv(
    "Run with: pnpm crawl (loads .env.local via tsx --env-file).",
  );
  // This run publishes to the live pathname, so it must keep the same
  // read/snapshot pair as cron: without them a local run overwrites the
  // outgoing charts unsnapshotted and skips carry-forward.
  const previousUrl = process.env.CHARTS_BLOB_URL;
  if (!previousUrl) {
    console.warn(
      "[crawl] CHARTS_BLOB_URL not set: carry-forward and prev snapshot skipped this run.",
    );
  }
  const itunes = createItunesFetchers({
    fetchRss: fetchAppleRss,
    fetchPlaylists,
    lookupTracks,
    throttle: createThrottle(),
  });
  const pageThrottle = createPlaylistPageThrottle();
  await crawlAll({
    countries: COUNTRIES,
    playlistAxis: {
      fetchPlaylists: itunes.fetchPlaylists,
      fetchPlaylistPage: (id, url) =>
        pageThrottle(() => fetchPlaylistPage(id, url)),
      uploadPlaylistFile,
    },
    fetchRss: itunes.fetchRss,
    lookupTracks: itunes.lookupTracks,
    spotify: spotifyFromEnv(),
    uploadCharts,
    fetchPrevious: previousUrl
      ? () => fetchPublishedCharts(previousUrl)
      : undefined,
    uploadPrevious: async (chartFile) => {
      try {
        await uploadPreviousCharts(chartFile);
      } catch (err) {
        console.warn(
          `[crawl] prev snapshot write failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    // Local debug entry never hits production revalidate; cron.ts injects the real one.
    triggerRevalidate: async () => {
      console.log("[crawl] revalidate skipped (local debug)");
    },
  });
}

await main();
