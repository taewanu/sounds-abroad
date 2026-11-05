import { readFile } from "node:fs/promises";

import type { Commentary } from "../../src/lib/chart-schema";
import { assertObjectStoreEnv } from "../lib/object-store";

import { fetchCommentaryStoreRaw } from "./fetch-commentary";
import { createClaudeJudge, fetchSourceText, groundEntry } from "./ground";
import { parseCandidateStore } from "./parse-store";
import { publishStore } from "./publish-store";
import { routeStore } from "./route";
import { backupCommentary, uploadCommentary } from "./upload-commentary";

// Validates a candidate commentary file against the schema, then routes each
// blurb through the gate: an entry that clears every check joins the live store,
// any failure drops that one card (ADR-0009). See docs/commentary-playbook.md.

assertObjectStoreEnv("Run via: pnpm commentary:publish <file>.");

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  throw new Error(
    "Usage: pnpm commentary:publish <candidate.json> [--replace]",
  );
}

const liveStoreUrl = process.env.COMMENTARY_BLOB_URL;
if (!liveStoreUrl) {
  throw new Error(
    "COMMENTARY_BLOB_URL missing. A publish without it would drop the live cards.",
  );
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

const { url, backupUrl, total } = await publishStore(
  published,
  { replace },
  {
    readLiveStore: () => fetchCommentaryStoreRaw(liveStoreUrl),
    backupLiveStore: () => backupCommentary(new Date().toISOString()),
    uploadStore: uploadCommentary,
  },
);
if (backupUrl) console.log(`Backed up current store -> ${backupUrl}`);
console.log(
  `Published ${publishedCount} entr(ies), dropped ${dropped.length}; store now ${total} -> ${url}`,
);
