import { COUNTRIES } from "../../src/lib/countries";

import { fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { triggerRevalidate } from "./revalidate-trigger";
import { crawlAll, crawlCountry } from "./run";
import { createThrottle } from "./throttle";
import { uploadCharts } from "./upload-blob";

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
    uploadCharts,
    triggerRevalidate,
  });
}

await main();
