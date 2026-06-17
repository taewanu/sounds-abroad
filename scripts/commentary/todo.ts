import { fetchPublishedCharts } from "../crawl/published-charts";

import { fetchCommentaryStore } from "./fetch-commentary";
import { computeWorklist } from "./worklist";

// Prints the tracks a refinement pass still needs to write: significant movers
// without a blurb yet, deduped across countries. See docs/commentary-playbook.md.

const chartsUrl = process.env.CHARTS_BLOB_URL;
if (!chartsUrl) {
  throw new Error(
    "CHARTS_BLOB_URL missing. Set it to the published charts.json URL.",
  );
}

const current = await fetchPublishedCharts(chartsUrl);
if (!current) {
  throw new Error(`Could not read published charts from ${chartsUrl}.`);
}

// Optional prior snapshot. Without it, the worklist falls back to absolute
// prominence (top-ranked tracks) instead of rank movement.
const prevUrl = process.env.CHARTS_PREV_BLOB_URL;
const previous = prevUrl ? await fetchPublishedCharts(prevUrl) : null;

const commentaryUrl = process.env.COMMENTARY_BLOB_URL;
const commentary = commentaryUrl
  ? ((await fetchCommentaryStore(commentaryUrl)) ?? {})
  : {};

// Drop thin-market low-confidence positions instead of just down-ranking them,
// so a focused pass writes only solid stories. See --json for the full list.
const suppressLowConfidence = process.argv.includes(
  "--suppress-low-confidence",
);

const worklist = computeWorklist({
  current,
  previous,
  commentary,
  options: { suppressLowConfidence },
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(worklist, null, 2));
} else {
  console.log(`${worklist.length} track(s) to write:\n`);
  for (const item of worklist) {
    const where = item.countries.map((c) => `${c.cc}#${c.rank}`).join(", ");
    const flag = item.confidence === "low" ? " [low-confidence]" : "";
    console.log(`  [${item.reason}]${flag} ${item.name} by ${item.artist}`);
    console.log(`      key: ${item.key}`);
    console.log(`      best rank ${item.bestRank} · ${where}\n`);
  }
}
