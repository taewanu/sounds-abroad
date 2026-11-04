import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

const HOOK = join(__dirname, "pre-push");
const REVIEW_ID = join(__dirname, "review-id");
const NO_COMMIT = "0".repeat(40);
const BRANCH_REF = "refs/heads/feature";

let repo: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-C",
      repo,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { encoding: "utf8" },
  ).trim();
}

function commitFile(name: string, content: string): string {
  writeFileSync(join(repo, name), content);
  git("add", name);
  git("commit", "-q", "-m", name);
  return git("rev-parse", "HEAD");
}

function recordReview(sha: string) {
  const records = join(repo, ".git", "pre-pr-reviewed");
  mkdirSync(records, { recursive: true });
  const id = execFileSync("sh", [REVIEW_ID, sha], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  writeFileSync(join(records, id), "");
}

function runHook(lines: [sha: string, remoteRef: string][], cwd = repo) {
  const input = lines
    .map(([sha, ref]) => `refs/heads/x ${sha} ${ref} ${NO_COMMIT}\n`)
    .join("");
  return spawnSync("sh", ["-e", HOOK], { cwd, encoding: "utf8", input });
}

function advanceMain(name: string, content = "main\n"): string {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  git("switch", "-q", "main");
  const sha = commitFile(name, content);
  git("update-ref", "refs/remotes/origin/main", sha);
  git("switch", "-q", branch);
  return sha;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "pre-push-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("update-ref", "refs/remotes/origin/main", commitFile("base", "base\n"));
  git("switch", "-q", "-c", "feature");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("reviewed changes push", () => {
  const sha = commitFile("change", "one\n");
  recordReview(sha);

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(0);
});

test("changes with no recorded review are refused, naming the commit", () => {
  const sha = commitFile("change", "one\n");

  const { status, stderr } = runHook([[sha, BRANCH_REF]]);

  expect(status).toBe(1);
  expect(stderr).toContain(sha.slice(0, 7));
});

test("a later code change needs its own review", () => {
  recordReview(commitFile("change", "one\n"));

  const sha = commitFile("change", "two\n");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("a whitespace change needs its own review", () => {
  recordReview(commitFile("change", "a\n  b\n"));

  const sha = commitFile("change", "a\n    b\n");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("a binary change needs its own review", () => {
  recordReview(commitFile("change", "\0one"));

  const sha = commitFile("change", "\0two");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("an external diff tool can't make unreviewed changes pass", () => {
  const sha = commitFile("change", "one\n");
  git("config", "diff.external", "/usr/bin/true");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("main moving ahead without a merge keeps the review", () => {
  const sha = commitFile("change", "one\n");
  recordReview(sha);

  advanceMain("elsewhere");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(0);
});

test("a clean merge of main keeps the review", () => {
  recordReview(commitFile("change", "one\n"));
  const main = advanceMain("elsewhere");

  git("-c", "merge.ff=false", "merge", "-q", "--no-edit", main);

  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(0);
});

test("a rebase onto main keeps the review", () => {
  recordReview(commitFile("change", "one\n"));
  const main = advanceMain("elsewhere");

  git("rebase", "-q", main);

  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(0);
});

test("a rename keeps its review when main edits the file", () => {
  const numbered = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => `line ${from + i}\n`).join("");
  const original = numbered(0, 100);
  git("merge", "-q", "--ff-only", advanceMain("tracked", original));
  git("mv", "tracked", "renamed");
  writeFileSync(join(repo, "renamed"), original + numbered(200, 8));
  git("add", "renamed");
  git("commit", "-q", "-m", "rename");
  recordReview(git("rev-parse", "HEAD"));

  const main = advanceMain("tracked", numbered(300, 60) + original);
  git("-c", "merge.ff=false", "merge", "-q", "--no-edit", main);

  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(0);
});

test("a branch with nothing beyond main needs no review", () => {
  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(0);
});

test("one unreviewed branch refuses the whole push", () => {
  const reviewed = commitFile("change", "one\n");
  recordReview(reviewed);
  const unreviewed = commitFile("change", "two\n");

  const { status } = runHook([
    [reviewed, "refs/heads/a"],
    [unreviewed, "refs/heads/b"],
  ]);

  expect(status).toBe(1);
});

test("a review recorded in one worktree counts in another", () => {
  const sha = commitFile("change", "one\n");
  recordReview(sha);
  const linked = join(mkdtempSync(join(repo, "worktrees-")), "linked");

  git("worktree", "add", "-q", "--detach", linked, sha);

  expect(runHook([[sha, BRANCH_REF]], linked).status).toBe(0);
});

test("a commit that can't be compared with main is refused", () => {
  const sha = commitFile("change", "one\n");
  git("update-ref", "-d", "refs/remotes/origin/main");

  const { status, stderr } = runHook([[sha, BRANCH_REF]]);

  expect(status).toBe(1);
  expect(stderr).toContain("could not compare");
});

test("deleting a branch needs no review", () => {
  expect(runHook([[NO_COMMIT, BRANCH_REF]]).status).toBe(0);
});

test("pushing a tag needs no review", () => {
  const sha = commitFile("change", "one\n");

  expect(runHook([[sha, "refs/tags/v1"]]).status).toBe(0);
});
