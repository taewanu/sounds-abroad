import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

type Finding = {
  severity: "blocker" | "minor";
  location: string;
  claim: string;
};
type Fix = {
  sha: string;
  rejected: { id: number; claim: string; reason: string }[];
};
type AgentOptions = { label: string; isolation?: string };
type Result = {
  status: string;
  head: string;
  blockers?: Finding[];
  minors: Finding[];
  rejected: Fix["rejected"];
};

const BODY = readFileSync(join(__dirname, "pre-pr.js"), "utf8").replace(
  "export const meta",
  "const meta",
);
const AsyncFunction = (async () => undefined).constructor as new (
  ...parameters: string[]
) => (...values: unknown[]) => Promise<Result>;

const START = "a".repeat(40);
const FIXED = "b".repeat(40);
const BLOCKER: Finding = {
  severity: "blocker",
  location: "a.ts:1",
  claim: "breaks",
};
const MINOR: Finding = {
  severity: "minor",
  location: "a.ts:2",
  claim: "naming",
};
const OTHER_BLOCKER: Finding = {
  severity: "blocker",
  location: "b.ts:1",
  claim: "also breaks",
};

function runWorkflow(
  reviewByRound: (Finding[] | null)[],
  fix: Fix | null = { sha: FIXED, rejected: [] },
  args: unknown = { sha: START, brief: "the goal" },
  stillHolding: Finding[] = [],
) {
  const agent = vi.fn(async (_prompt: string, { label }: AgentOptions) => {
    if (label.startsWith("fix-")) return fix;
    if (label.startsWith("blocker-recheck")) return { findings: stillHolding };
    const findings = reviewByRound[Number(label.at(-1)) - 1];
    return (
      findings && { findings: label.startsWith("outside") ? [] : findings }
    );
  });
  const parallel = (thunks: (() => Promise<unknown>)[]) =>
    Promise.all(thunks.map((thunk) => thunk()));
  const run = new AsyncFunction("agent", "parallel", "log", "args", BODY);
  const labels = () => agent.mock.calls.map(([, { label }]) => label);
  return { result: run(agent, parallel, () => undefined, args), agent, labels };
}

test("a review with no blocker ends after one round, keeping its minors", async () => {
  const { result, labels } = runWorkflow([[MINOR]]);

  expect(await result).toMatchObject({
    status: "clean",
    head: START,
    minors: [MINOR],
  });
  expect(labels()).toEqual(["standards-and-spec-1", "outside-the-diff-1"]);
});

test("a fixed blocker gets a second round that reviews only the fix", async () => {
  const { result, agent } = runWorkflow([[BLOCKER], []]);

  expect(await result).toMatchObject({ status: "clean", head: FIXED });
  const secondRound = agent.mock.calls.find(
    ([, { label }]) => label === "outside-the-diff-2",
  );
  expect(secondRound?.[0]).toContain(`git checkout --detach ${FIXED}`);
  expect(secondRound?.[0]).toContain(`git diff ${START}...HEAD`);
});

test("a blocker in the last round stops without another fix or review", async () => {
  const { result, labels } = runWorkflow([[BLOCKER], [BLOCKER], [BLOCKER]]);

  expect(await result).toMatchObject({
    status: "blocked",
    head: FIXED,
    blockers: [BLOCKER],
  });
  expect(labels().filter((label) => label.startsWith("fix-"))).toEqual([
    "fix-1",
  ]);
  expect(labels()).not.toContain("outside-the-diff-3");
});

test("blockers the fixer rejects end the review without moving the head", async () => {
  const rejected = [{ id: 0, claim: "breaks", reason: "unreachable" }];
  const { result, labels } = runWorkflow([[BLOCKER]], { sha: START, rejected });

  expect(await result).toMatchObject({
    status: "clean",
    head: START,
    rejected,
  });
  expect(labels()).not.toContain("outside-the-diff-2");
});

test("a blocker the fixer neither commits nor rejects comes back blocked", async () => {
  const rejected = [{ id: 1, claim: "also breaks", reason: "unreachable" }];
  const { result, labels } = runWorkflow([[BLOCKER, OTHER_BLOCKER]], {
    sha: START,
    rejected,
  });

  expect(await result).toMatchObject({
    status: "blocked",
    head: START,
    blockers: [BLOCKER],
    rejected,
  });
  expect(labels()).not.toContain("outside-the-diff-2");
});

test("the second round rechecks each blocker the fixer didn't reject", async () => {
  const { result, agent } = runWorkflow(
    [[BLOCKER, OTHER_BLOCKER], []],
    {
      sha: FIXED,
      rejected: [{ id: 1, claim: "also breaks", reason: "unreachable" }],
    },
    { sha: START, brief: "the goal" },
    [BLOCKER],
  );

  expect(await result).toMatchObject({
    status: "blocked",
    head: FIXED,
    blockers: [BLOCKER],
  });
  const recheck = agent.mock.calls.find(
    ([, { label }]) => label === "blocker-recheck-2",
  );
  expect(recheck?.[0]).toContain(`git checkout --detach ${FIXED}`);
  expect(recheck?.[0]).toContain(BLOCKER.claim);
  expect(recheck?.[0]).not.toContain(OTHER_BLOCKER.claim);
});

test("a fixer that resolves every blocker it didn't reject ends clean", async () => {
  const { result, labels } = runWorkflow([[BLOCKER], []]);

  expect(await result).toMatchObject({ status: "clean", head: FIXED });
  expect(labels()).toContain("blocker-recheck-2");
});

test("a dead reviewer or fixer is incomplete, never clean", async () => {
  expect(await runWorkflow([null]).result).toMatchObject({
    status: "incomplete",
  });
  expect(await runWorkflow([[BLOCKER]], null).result).toMatchObject({
    status: "incomplete",
  });
});

test("every agent runs in its own worktree", async () => {
  const { result, agent } = runWorkflow([[BLOCKER], []]);
  await result;

  for (const [, options] of agent.mock.calls) {
    expect(options.isolation).toBe("worktree");
  }
});

test("a guard change adds the comparison reviewer", async () => {
  const { result, labels } = runWorkflow([[]], null, {
    sha: START,
    brief: "the goal",
    guard: true,
  });
  await result;

  expect(labels()).toContain("guard-comparison-1");
});

test("a missing commit or brief fails before any agent starts", async () => {
  const { result, agent } = runWorkflow([[]], null, { sha: START });

  await expect(result).rejects.toThrow("args.sha and args.brief");
  expect(agent).not.toHaveBeenCalled();
});
