import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { put } from "@vercel/blob";
import { ChartFileSchema } from "../../src/lib/chart-schema";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/lib/__fixtures__/charts.json",
);

const BLOB_PATHNAME = "charts/v1/charts.json";

async function uploadOnce(body: string): Promise<string> {
  const result = await put(BLOB_PATHNAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN missing. Run with: pnpm blob:upload-fixture (loads .env.local via tsx --env-file).",
    );
  }

  const raw = await readFile(FIXTURE_PATH, "utf8");
  const parsed = ChartFileSchema.parse(JSON.parse(raw));

  console.log("Upload 1: original fixture body");
  const url1 = await uploadOnce(raw);
  console.log(`  → ${url1}`);

  const bumped = JSON.stringify(
    {
      ...parsed,
      lastUpdated: new Date().toISOString(),
    },
    null,
    2,
  );
  ChartFileSchema.parse(JSON.parse(bumped));
  console.log("Upload 2: lastUpdated bumped to now");
  const url2 = await uploadOnce(bumped);
  console.log(`  → ${url2}`);

  if (url1 !== url2) {
    throw new Error(`URL not stable across overwrites: ${url1} !== ${url2}`);
  }
  console.log(`\nStable URL verified: ${url1}`);
}

await main();
