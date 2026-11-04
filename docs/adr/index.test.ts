import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "../..");
const index = readFileSync(join(import.meta.dirname, "README.md"), "utf8");

function linkedRecords(markdown: string): string[] {
  return [...markdown.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)].map(
    ([, file]) => file,
  );
}

test("the index links every decision record exactly once", () => {
  const records = readdirSync(import.meta.dirname).filter((file) =>
    /^\d{4}-.+\.md$/.test(file),
  );

  expect(linkedRecords(index).sort()).toEqual(records.sort());
});

test("no file outside the decision records cites a historical one", () => {
  const historical = linkedRecords(
    index.slice(index.indexOf("## Historical")),
  ).map((file) => file.slice(0, 4));

  const citations = spawnSync(
    "git",
    [
      "grep",
      "-n",
      "-E",
      `(ADR[- ]|adr/)(${historical.join("|")})`,
      "--",
      ".",
      ":(exclude)docs/adr",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  expect(historical).not.toHaveLength(0);
  expect(citations.stderr).toBe("");
  expect(citations.stdout).toBe("");
});
