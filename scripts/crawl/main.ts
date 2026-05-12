import { fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { triggerRevalidate } from "./revalidate-trigger";
import { crawlCountry } from "./run";
import { createThrottle } from "./throttle";
import { uploadCharts } from "./upload-blob";

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  kr: "South Korea",
};

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN missing. Run with: pnpm crawl (loads .env.local via tsx --env-file).",
    );
  }

  const cc = process.argv[2] ?? "kr";
  const name = COUNTRY_NAMES[cc];
  if (!name) {
    throw new Error(
      `Unknown country code "${cc}". Known: ${Object.keys(COUNTRY_NAMES).join(", ")}`,
    );
  }

  const throttle = createThrottle();

  console.log(`[crawl] starting one-country crawl for ${cc} (${name})...`);
  const result = await crawlCountry({
    cc,
    name,
    fetchRss: fetchAppleRss,
    lookupTrack,
    throttle,
    uploadCharts,
    triggerRevalidate,
  });

  const country = result.chartFile.countries[cc];
  console.log(
    `[crawl] uploaded ${country.tracks.length}/25 tracks (valid=${country.valid})`,
  );
  console.log(`[crawl] → ${result.url}`);
}

await main();
