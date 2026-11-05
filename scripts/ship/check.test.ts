import { expect, test } from "vitest";

import {
  formatShipCheck,
  riskTier,
  shipCheck,
  type PullRequest,
} from "./check";

const HEAD = "abcdef1234567890";

function diffTouching(...files: string[]): string {
  return files
    .flatMap((file) => [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      "@@ -1 +1 @@",
      "-before",
      "+after",
    ])
    .join("\n");
}

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    state: "OPEN",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    labels: [],
    body: "## Intent\n\nA goal.\n\nDoor: two-way\n",
    headSha: HEAD,
    reviews: [{ login: "coderabbitai", commitSha: HEAD }],
    diff: diffTouching("src/lib/example.ts"),
    ...overrides,
  };
}

test("a change to application code is medium", () => {
  expect(riskTier(pullRequest())).toBe("medium");
});

test.each([
  "docs/adr/0001-example.md",
  "docs/agents/domain.md",
  ".claude/skills/example/SKILL.md",
])("a change to %s steers agents, so it is medium", (file) => {
  expect(riskTier(pullRequest({ diff: diffTouching(file) }))).toBe("medium");
});

test.each(["docs/guide.md", "src/lib/example.test.ts"])(
  "a change only to %s is low",
  (file) => {
    expect(riskTier(pullRequest({ diff: diffTouching(file) }))).toBe("low");
  },
);

test.each([
  "src/lib/chart-schema.ts",
  "src/app/c/[code]/page.tsx",
  ".github/workflows/cron-crawl.yml",
  ".husky/pre-push",
  ".claude/hooks/block-dangerous-git.sh",
  ".claude/skills/ship/SKILL.md",
  "scripts/ship/check.ts",
  "AGENTS.md",
  ".coderabbit.yaml",
  "package.json",
  "pnpm-lock.yaml",
  "mise.toml",
  "vitest.config.ts",
])("a change to %s is high, even beside low-risk files", (file) => {
  const diff = diffTouching("docs/guide.md", file);

  expect(riskTier(pullRequest({ diff }))).toBe("high");
});

test("renaming a human-only file away from its path is high", () => {
  const diff = "diff --git a/src/lib/chart-schema.ts b/docs/moved.md\n";

  expect(riskTier(pullRequest({ diff }))).toBe("high");
});

test.each(["Door: one-way", "Door: two-way | one-way", "No door line at all"])(
  "a body stating %s is high",
  (body) => {
    expect(riskTier(pullRequest({ body }))).toBe("high");
  },
);

test("an empty diff is high", () => {
  expect(riskTier(pullRequest({ diff: "" }))).toBe("high");
});

test("a changed line naming a cache lifetime is high, wherever it sits", () => {
  const diff = `${diffTouching("src/lib/example.ts")}\n+const header = "max-age=60";`;

  expect(riskTier(pullRequest({ diff }))).toBe("high");
});

test("an unchanged line naming a cache lifetime doesn't raise the tier", () => {
  const diff = `${diffTouching("src/lib/example.ts")}\n const header = "max-age=60";`;

  expect(riskTier(pullRequest({ diff }))).toBe("medium");
});

test.each([
  ["a closed PR", { state: "CLOSED" }, "not open for merge"],
  ["a draft", { isDraft: true }, "not open for merge"],
  ["a hold label", { labels: ["hold"] }, "hold label"],
  [
    "a merge GitHub would refuse",
    { mergeStateStatus: "BLOCKED" },
    "GitHub reports BLOCKED",
  ],
  ["a one-way door", { body: "Door: one-way" }, "a human merges this tier"],
])("%s parks", (_name, overrides, reason) => {
  const check = shipCheck(pullRequest(overrides));

  expect(check.verdict).toBe("park");
  expect(check.reason).toBe(reason);
});

test("medium parks when the only review is on an earlier commit", () => {
  const reviews = [{ login: "coderabbitai", commitSha: "earlier" }];

  const check = shipCheck(pullRequest({ reviews }));

  expect(check.verdict).toBe("park");
  expect(check.reason).toBe("no CodeRabbit review on the latest commit");
});

test("medium parks when only a person reviewed the latest commit", () => {
  const reviews = [{ login: "someone", commitSha: HEAD }];

  expect(shipCheck(pullRequest({ reviews })).verdict).toBe("park");
});

test.each(["coderabbitai", "coderabbitai[bot]"])(
  "medium passes with a review from %s on the latest commit",
  (login) => {
    const reviews = [{ login, commitSha: HEAD }];

    expect(shipCheck(pullRequest({ reviews })).verdict).toBe("merge-ok");
  },
);

test("low passes without a review", () => {
  const pr = pullRequest({ diff: diffTouching("docs/guide.md"), reviews: [] });

  expect(shipCheck(pr)).toEqual({
    verdict: "merge-ok",
    tier: "low",
    reason: "all checks passed",
  });
});

test("the report names the verdict, tier, short head and reason", () => {
  expect(formatShipCheck(pullRequest())).toBe(
    `ship check: merge-ok | tier medium | head ${HEAD.slice(0, 7)} | all checks passed`,
  );
});
