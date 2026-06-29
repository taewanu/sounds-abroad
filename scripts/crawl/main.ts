import { COUNTRIES } from "../../src/lib/countries";

import { fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { crawlAll, crawlCountry, type SpotifyResolution } from "./run";
import { createSpotifyResolver } from "./spotify-resolve";
import { createSpotifyThrottle, createThrottle } from "./throttle";
import { uploadCharts } from "./upload-blob";

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

  const throttle = createThrottle();
  console.log(`[crawl ${cc}] starting single-country debug crawl...`);
  const { country } = await crawlCountry({
    cc,
    name: entry.name,
    fetchRss: fetchAppleRss,
    lookupTrack,
    throttle,
    spotify: spotifyFromEnv(),
  });
  console.log(
    `[crawl ${cc}] ${country.tracks.length} tracks (valid=${country.valid})`,
  );
  console.log("[crawl] (dry run — no upload, no revalidate)");
  console.log(JSON.stringify({ [cc]: country }, null, 2));
}

async function runAllCountries(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN missing. Run with: pnpm crawl (loads .env.local via tsx --env-file).",
    );
  }
  const throttle = createThrottle();
  await crawlAll({
    countries: COUNTRIES,
    fetchRss: fetchAppleRss,
    lookupTrack,
    throttle,
    spotify: spotifyFromEnv(),
    uploadCharts,
    // Local debug entry never hits production revalidate — cron.ts injects the real one.
    triggerRevalidate: async () => {
      console.log("[crawl] revalidate skipped (local debug)");
    },
  });
}

await main();
