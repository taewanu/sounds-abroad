import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import { SITE_URL } from "../src/lib/site-url";

import { checkHealth } from "./control/health";

const USAGE = "Usage: pnpm control health [--sha <commit>]";
const COMMIT = /^[0-9a-f]{7,40}$/;

/** The commit production should be serving, read from the remote so it can't lag a stale local ref. */
function remoteMainCommit(): string {
  return execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], {
    encoding: "utf8",
  }).split(/\s/)[0];
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { sha: { type: "string" } },
  });
  const expectedSha = values.sha ?? remoteMainCommit();
  if (
    positionals.length !== 1 ||
    positionals[0] !== "health" ||
    !COMMIT.test(expectedSha)
  ) {
    console.error(USAGE);
    return 2;
  }

  const results = await checkHealth({ origin: SITE_URL, expectedSha });
  for (const { passed, detail } of results) {
    if (passed) console.log(`ok    ${detail}`);
    else console.error(`FAIL  ${detail}`);
  }
  return results.every(({ passed }) => passed) ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 2;
  },
);
