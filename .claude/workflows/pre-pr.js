export const meta = {
  name: "pre-pr",
  description:
    "Review a branch in clean-context agents and fix its blockers, within two rounds",
  whenToUse: "From the pre-pr skill, once the CI checks pass on the branch",
  phases: [{ title: "Review" }, { title: "Fix" }],
};

const MAX_ROUNDS = 2;

// Unsure leans minor because a minor still reaches the user through the PR body, while a false blocker spends the last round.
const SEVERITY_RULE =
  "Label each finding. A `blocker` is a defect that real use of this repository can trigger and that breaks what the brief sets out to do, breaks production behavior, loses data, or raises a metered cost; state that trigger. Everything else is `minor`, including style, naming, docs, inputs this repository can't produce, and defects the change didn't introduce. When unsure, label it `minor` and say what would make it a blocker.";

const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { enum: ["blocker", "minor"] },
          location: { type: "string", description: "file:line" },
          claim: {
            type: "string",
            description: "The failure, its trigger and its consequence",
          },
        },
        required: ["severity", "location", "claim"],
      },
    },
  },
  required: ["findings"],
};

const FIX = {
  type: "object",
  properties: {
    sha: {
      type: "string",
      description: "Full output of git rev-parse HEAD after any commit",
    },
    rejected: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The blocker's id" },
          claim: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "claim", "reason"],
      },
    },
  },
  required: ["sha", "rejected"],
};

// A worktree agent starts from whatever base the harness picked, not from the branch under review.
const pinTo = (sha) =>
  `You are in a throwaway git worktree. First run \`git checkout --detach ${sha}\` there. Run git only in this directory, and never cd to another checkout.`;

const standardsAndSpec = (since, brief) =>
  `Run the \`code-review\` skill with \`${since}\` as the fixed point. You can't ask the user anything: the brief below stands in for the spec, and its claims are unverified. If the skill isn't installed, review the diff against the repository's documented standards and the brief yourself, and say so in a minor finding.\n\nBrief:\n${brief}`;

const outsideTheDiff = (since) =>
  `Review \`git diff ${since}...HEAD\`. For every changed line, trace its callers and dependents outside the diff: grep the call sites and read the code they reach. Report each failure the change newly exposes or makes worse, with the triggering condition, the consequence, and the worst-case bound before and after (staleness, cost, latency, data loss). Give extra weight to anything the diff removes, lengthens or narrows, such as a timer, retry, cache lifetime, fallback, validation or limit, and name what that safeguard used to catch. Report nothing rather than padding the list.`;

const guardComparison = (since) =>
  `The change in \`git diff ${since}...HEAD\` is a guard or a filter. Compare it against the version at \`${since}\` on generated inputs, because a table written beside the code shares its assumptions. Report each class of input where the two disagree and the brief doesn't ask them to.`;

// A reviewer of the fix's diff can't see a defect the fix left alone, so one agent checks the earlier blockers directly.
const blockerRecheck = (unresolved) =>
  `An earlier review raised these blockers, and a commit followed that may not resolve them:\n${JSON.stringify(unresolved, null, 2)}\n\nRead the code at HEAD. Report each one that still holds as a \`blocker\`, even where the rule below calls a defect the change didn't introduce \`minor\`. Report nothing for the ones that no longer hold.`;

const reviewers = (since, { brief, guard }, unresolved) => [
  { label: "standards-and-spec", prompt: standardsAndSpec(since, brief) },
  { label: "outside-the-diff", prompt: outsideTheDiff(since) },
  ...(guard
    ? [{ label: "guard-comparison", prompt: guardComparison(since) }]
    : []),
  ...(unresolved.length > 0
    ? [{ label: "blocker-recheck", prompt: blockerRecheck(unresolved) }]
    : []),
];

const fixBlockers = (head, blockers) =>
  `${pinTo(head)}\n\nThen run \`mise trust && mise exec -- pnpm install --frozen-lockfile\`, so the commit hook and the tests can run.\n\nReviewers found these blockers:\n${JSON.stringify(
    blockers.map((blocker, id) => ({ id, ...blocker })),
    null,
    2,
  )}\n\nVerify each against the code, because a reviewer can be wrong. Fix the ones that hold, change nothing else, and make one commit whose message says why. List the ones that don't hold as rejected, with the id and the reason. Keep a blocker that holds off that list even if you can't fix or commit it: it goes back to the user as blocked.`;

if (!args?.sha || !args?.brief)
  throw new Error("pre-pr needs args.sha and args.brief");

const minors = [];
const rejected = [];
let head = args.sha;
let since = "origin/main";
let unresolved = [];

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const reviews = await parallel(
    reviewers(since, args, unresolved).map(
      ({ label, prompt }) =>
        () =>
          agent(`${pinTo(head)}\n\n${prompt}\n\n${SEVERITY_RULE}`, {
            label: `${label}-${round}`,
            phase: "Review",
            schema: FINDINGS,
            isolation: "worktree",
          }),
    ),
  );
  // A reviewer that died found nothing, which must not read as a clean review.
  if (reviews.includes(null))
    return { status: "incomplete", head, minors, rejected };

  const findings = reviews.flatMap((review) => review.findings);
  minors.push(...findings.filter((finding) => finding.severity === "minor"));
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  if (blockers.length === 0) return { status: "clean", head, minors, rejected };
  if (round === MAX_ROUNDS) {
    log(
      `Stopped at the ${MAX_ROUNDS}-round cap with ${blockers.length} blocker(s) unfixed`,
    );
    return { status: "blocked", head, blockers, minors, rejected };
  }

  // Fixes land in the agent's own worktree, so the branch moves only when the user accepts them.
  const fix = await agent(fixBlockers(head, blockers), {
    label: `fix-${round}`,
    phase: "Fix",
    schema: FIX,
    isolation: "worktree",
  });
  if (!fix) return { status: "incomplete", head, minors, rejected };

  rejected.push(...fix.rejected);
  const rejectedIds = new Set(fix.rejected.map(({ id }) => id));
  unresolved = blockers.filter((_, id) => !rejectedIds.has(id));
  if (fix.sha === head) {
    return unresolved.length > 0
      ? { status: "blocked", head, blockers: unresolved, minors, rejected }
      : { status: "clean", head, minors, rejected };
  }
  since = head;
  head = fix.sha;
}
