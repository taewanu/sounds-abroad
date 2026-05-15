import { COUNTRIES } from "../../src/lib/countries";

import { fetchAppleRss } from "./apple-rss";
import { lookupTrack } from "./itunes-lookup";
import { crawlCountry } from "./run";
import { createThrottle } from "./throttle";

async function main(): Promise<void> {
  const cc = process.argv[2];
  if (!cc) {
    throw new Error(
      "All-countries mode not wired up yet. For now run: pnpm crawl <cc>",
    );
  }
  await runSingleCountry(cc);
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

await main();
