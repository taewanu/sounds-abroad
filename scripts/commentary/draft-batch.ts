import type { Commentary } from "../../src/lib/chart-schema";
import type { CommentaryStore } from "../../src/lib/commentary-store";
import { fetchPublishedCharts } from "../crawl/published-charts";
import { assertObjectStoreEnv } from "../lib/object-store";

import { createClaudeDrafter, draftEntry } from "./draft";
import { dropsUrlFrom, recordAttempts } from "./drops";
import { salvageCommentaryStore } from "./fetch-commentary";
import { fetchDrops } from "./fetch-drops";
import { createClaudeJudge, fetchSourceText, groundEntry } from "./ground";
import { loadPreviousCharts } from "./previous-charts";
import { publishStore } from "./publish-store";
import { routeStore } from "./route";
import {
  backupCommentary,
  readLiveCommentary,
  uploadCommentary,
} from "./upload-commentary";
import { uploadDrops } from "./upload-drops";
import { computeWorklist, type WorklistItem } from "./worklist";

// Auto-drafts blurbs for the worklist, then routes each through the publish gate
// and merges the survivors into the live store (#121). The drafter and the gate
// both spend the subscription, so the batch is bounded by --limit and runs on
// the laptop. See docs/commentary-playbook.md.

assertObjectStoreEnv("Run via: pnpm commentary:draft.");

const chartsUrl = process.env.CHARTS_BLOB_URL;
if (!chartsUrl) {
  throw new Error("CHARTS_BLOB_URL missing. Set it to the charts.json URL.");
}

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Bound the batch: each item costs a drafter call and, if it drafts, a grounding
// call. Default small so a run is observable and cheap; raise it deliberately.
const limit = Number(flagValue("--limit") ?? 5);
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error(`--limit must be a positive integer, got ${limit}.`);
}
// Optional case-insensitive filter on artist/title/key, to target specific
// tracks (e.g. a well-documented song for a first live run).
const grep = flagValue("--grep")?.toLowerCase();

const current = await fetchPublishedCharts(chartsUrl);
if (!current) {
  throw new Error(`Could not read published charts from ${chartsUrl}.`);
}

const previous = await loadPreviousCharts(process.env.CHARTS_PREV_BLOB_URL);

// Read the live store raw, never schema-validated: one entry that fails the
// since-tightened schema must not void the whole store.
const existing = await readLiveCommentary();
const commentaryUrl = process.env.COMMENTARY_BLOB_URL;

// The drop ledger lives beside the commentary store. Read it so the worklist
// skips tracks that have already spent their retries on the gate (#139); without
// a published store there is no ledger yet, so start empty.
const dropsUrl = commentaryUrl ? dropsUrlFrom(commentaryUrl) : undefined;
const priorDrops = dropsUrl ? await fetchDrops(dropsUrl) : {};

// The worklist diffs against the validated view, not the raw base: an entry
// the tightened schema rejects bakes as no card, so its key must re-queue for
// drafting instead of blocking its own regeneration. The raw `existing` stays
// the merge base below, so the fresh draft overwrites the invalid entry and
// the store converges back to valid.
const { store: validExisting, droppedKeys } = salvageCommentaryStore(existing);
if (droppedKeys.length > 0) {
  console.warn(
    `[draft] ${droppedKeys.length} invalid entr${droppedKeys.length === 1 ? "y" : "ies"} re-queued for drafting: ${droppedKeys.join(", ")}`,
  );
}

// Suppress thin-market low-confidence positions: don't spend a drafter call on
// noise the worklist would rank last anyway (#117).
const worklist = computeWorklist({
  current,
  previous,
  commentary: validExisting,
  drops: priorDrops,
  options: { suppressLowConfidence: true },
});

const matches = (item: WorklistItem): boolean =>
  !grep ||
  item.artist.toLowerCase().includes(grep) ||
  item.name.toLowerCase().includes(grep) ||
  item.key.toLowerCase().includes(grep);

const selected = worklist.filter(matches).slice(0, limit);

if (selected.length === 0) {
  console.log("Nothing to draft (worklist empty or no --grep match).");
  process.exit(0);
}

console.log(
  `Drafting ${selected.length} of ${worklist.length} worklist item(s):`,
);

// One timestamp for the batch; every blurb is generated in this pass.
const generatedAt = new Date().toISOString();
const drafter = createClaudeDrafter();

const candidates: CommentaryStore = {};
for (const item of selected) {
  console.log(`  drafting "${item.name}" by ${item.artist}...`);
  const draft = await draftEntry(item, generatedAt, drafter);
  if (!draft) {
    console.warn(
      `    could not draft (malformed or research failed); skipping.`,
    );
    continue;
  }
  candidates[item.key] = draft;
  // Echo the full blurb the drafter produced so a run shows every field a drop
  // is judged against (tag and detail trip lints too) and the sources the
  // allowlist grows from.
  console.log(`    [${draft.claim}] tag: ${draft.tag}`);
  console.log(`    lead: ${draft.lead}`);
  if (draft.detail) console.log(`    detail: ${draft.detail}`);
  console.log(`    sources: ${draft.sources.join(", ")}`);
}

const draftedCount = Object.keys(candidates).length;
if (draftedCount === 0) {
  console.error(
    "No blurbs drafted. Nothing to route; the live store is unchanged.",
  );
  process.exit(1);
}

// Route only the new drafts through the gate. The existing store already passed
// when it was published, so re-routing it would re-spend grounding calls and
// could drop a card whose source has since gone stale.
const judge = createClaudeJudge();
const ground = (entry: Commentary) =>
  groundEntry(entry, { fetchSourceText, judge });

const { published, dropped } = await routeStore(candidates, { ground });
for (const { key, reasons } of dropped) {
  console.warn(`Dropped "${key}": ${reasons.join("; ")}`);
}

// Update the drop ledger before any early exit: this batch's drops must persist
// even when nothing published, so the next batch stops re-drafting these keys.
const nextDrops = recordAttempts(
  priorDrops,
  dropped,
  Object.keys(published),
  generatedAt,
);
const dropsLedgerUrl = await uploadDrops(nextDrops);
console.log(
  `Drop ledger now ${Object.keys(nextDrops).length} key(s) -> ${dropsLedgerUrl}`,
);

const survivors = Object.keys(published).length;
if (survivors === 0) {
  console.log(
    `No drafts cleared the gate (${dropped.length} dropped). The live store is unchanged.`,
  );
  process.exit(0);
}

// The worklist excludes keys that already have a blurb, so the merge only adds
// cards.
const { url, backupUrl, total } = await publishStore(
  published,
  existing,
  { replace: false },
  {
    backupLiveStore: () => backupCommentary(generatedAt),
    uploadStore: uploadCommentary,
  },
);
if (backupUrl) console.log(`Backed up current store -> ${backupUrl}`);
console.log(
  `Published ${survivors} new blurb(s), dropped ${dropped.length}; store now ${total} -> ${url}`,
);
