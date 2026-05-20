import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const workflowPath = ".github/workflows/cron-crawl.yml";
const cronTsPath = "scripts/crawl/cron.ts";

function extractCron(relPath: string, pattern: RegExp): string {
  const contents = readFileSync(resolve(repoRoot, relPath), "utf8");
  const match = contents.match(pattern);
  if (!match) {
    throw new Error(`Cron expression not found in ${relPath}`);
  }
  return match[1];
}

test(`cron schedule in ${workflowPath} matches ${cronTsPath}`, () => {
  const workflowCron = extractCron(
    workflowPath,
    /^\s*-\s*cron:\s*["']([^"']+)["']/m,
  );
  const tsCron = extractCron(
    cronTsPath,
    /^\s*schedule:\s*\{[\s\S]*?\bvalue:\s*["']([^"']+)["']/m,
  );
  expect(workflowCron).toBe(tsCron);
});
