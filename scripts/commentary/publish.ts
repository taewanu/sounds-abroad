import { readFile } from "node:fs/promises";

import type { Commentary } from "../../src/lib/chart-schema";

import { createClaudeJudge, fetchSourceText, groundEntry } from "./ground";
import { parseCandidateStore } from "./parse-store";
import { routeStore } from "./route";
import { backupCommentary, uploadCommentary } from "./upload-commentary";

// Validates a candidate commentary file against the schema, then routes each
// blurb through the gate: an entry that clears every check publishes, any
// failure drops that one card (ADR-0009). See docs/commentary-playbook.md.

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(
    "BLOB_READ_WRITE_TOKEN missing. Run via: pnpm commentary:publish <file>.",
  );
}

const file = process.argv[2];
if (!file) {
  throw new Error("Usage: pnpm commentary:publish <candidate.json>");
}

const raw: unknown = JSON.parse(await readFile(file, "utf8"));
const parsed = parseCandidateStore(raw);
if (!parsed.ok) {
  console.error(`Publish blocked (${parsed.errors.length} schema issue(s)):`);
  for (const error of parsed.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const judge = createClaudeJudge();
const ground = (entry: Commentary) =>
  groundEntry(entry, { fetchSourceText, judge });

const { published, dropped } = await routeStore(parsed.store, { ground });
for (const { key, reasons } of dropped) {
  console.warn(`Dropped "${key}": ${reasons.join("; ")}`);
}

// Every entry dropping is almost always a systemic failure (the judge is down,
// sources unreachable), not a store that is genuinely all-bad. Publishing an
// empty store would wipe every live card, so refuse it and surface the cause.
const publishedCount = Object.keys(published).length;
if (publishedCount === 0) {
  console.error(
    `No entries cleared the gate (${dropped.length} dropped). Not publishing an empty store.`,
  );
  process.exit(1);
}

// Snapshot the live store before overwriting, so a bad publish can be undone.
// Absent on the first publish (nothing to back up yet).
const previousUrl = process.env.COMMENTARY_BLOB_URL;
if (previousUrl) {
  const backupUrl = await backupCommentary(
    previousUrl,
    new Date().toISOString(),
  );
  console.log(`Backed up current store -> ${backupUrl}`);
}

const url = await uploadCommentary(published);
console.log(
  `Published ${publishedCount} entr(ies), dropped ${dropped.length} -> ${url}`,
);
