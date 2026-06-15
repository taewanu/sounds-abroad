import { readFile } from "node:fs/promises";

import { prepublishCheck } from "./prepublish";
import { backupCommentary, uploadCommentary } from "./upload-commentary";

// Validates a candidate commentary file, hard-blocks on the schema or the
// no-lyric lint, then publishes it. See docs/commentary-playbook.md.

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
const checked = prepublishCheck(raw);
if (!checked.ok) {
  console.error(`Publish blocked (${checked.errors.length} issue(s)):`);
  for (const error of checked.errors) console.error(`  - ${error}`);
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

const url = await uploadCommentary(checked.store);
console.log(
  `Published ${Object.keys(checked.store).length} entr(ies) -> ${url}`,
);
