import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

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

function commitFile(name: string, content: string | Uint8Array): string {
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

function hookWithInput(input: string, cwd = repo) {
  return spawnSync("sh", ["-e", HOOK], { cwd, encoding: "utf8", input });
}

function runHook(lines: [sha: string, remoteRef: string][], cwd = repo) {
  const input = lines
    .map(([sha, ref]) => `refs/heads/x ${sha} ${ref} ${NO_COMMIT}\n`)
    .join("");
  return hookWithInput(input, cwd);
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
  vi.unstubAllEnvs();
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

test.each([
  ["whitespace inside a line", "a b\n", "a  b\n"],
  ["indentation", "a\n  b\n", "a\n    b\n"],
  ["line endings", "a\nb\n", "a\r\nb\r\n"],
])("a change to %s needs its own review", (_name, before, after) => {
  recordReview(commitFile("change", before));

  const sha = commitFile("change", after);

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("a binary change needs its own review", () => {
  recordReview(commitFile("change", "\0one"));

  const sha = commitFile("change", "\0two");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("a mode-only change is treated like any other change", () => {
  commitFile("script", "run\n");
  const reviewed = git("rev-parse", "HEAD");
  recordReview(reviewed);
  git("update-index", "--chmod=+x", "script");
  git("commit", "-q", "-m", "mode");

  const { status } = runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]);

  expect(status).toBe(1);
});

test("an external diff tool can't make unreviewed changes pass", () => {
  const sha = commitFile("change", "one\n");
  git("config", "diff.external", "/usr/bin/true");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("color output keeps the review", () => {
  const sha = commitFile("change", "one\n");
  recordReview(sha);

  git("config", "color.ui", "always");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(0);
});

test("bytes invalid in the locale still identify the change", () => {
  vi.stubEnv("LC_ALL", "en_US.UTF-8");
  const reviewed = commitFile("change", Buffer.from([0x61, 0xff, 0x0a]));
  recordReview(reviewed);

  expect(runHook([[reviewed, BRANCH_REF]]).status).toBe(0);

  const sha = commitFile("change", Buffer.from([0x62, 0xff, 0x0a]));

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
});

test("a failing patch-id is refused rather than read as no changes", () => {
  const sha = commitFile("change", "one\n");
  const realGit = execFileSync("sh", ["-c", "command -v git"], {
    encoding: "utf8",
  }).trim();
  const bin = mkdtempSync(join(repo, "bin-"));
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\n[ "$1" = patch-id ] && exit 1\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);

  const { status, stderr } = runHook([[sha, BRANCH_REF]]);

  expect(status).toBe(1);
  expect(stderr).toContain("could not compare");
});

test("a diff that can't be read is refused rather than read as no changes", () => {
  const main = commitFile("change", "one\n");
  git("update-ref", "refs/remotes/origin/main", main);
  const preImage = git("rev-parse", `${main}:change`);
  const sha = commitFile("change", "two\n");
  rmSync(
    join(repo, ".git", "objects", preImage.slice(0, 2), preImage.slice(2)),
  );

  const { status, stderr } = runHook([[sha, BRANCH_REF]]);

  expect(status).toBe(1);
  expect(stderr).toContain("could not compare");
});

test.each([
  ["valid", [0x61, 0x00, 0x62, 0x0a]],
  ["invalid", [0xff, 0x00, 0x0a]],
])("a NUL byte in text with %s encoding is refused", (_name, bytes) => {
  vi.stubEnv("LC_ALL", "en_US.UTF-8");
  const text = `${"x".repeat(9000)}\n`;
  const sha = commitFile(
    "change",
    Buffer.concat([Buffer.from(text), Buffer.from(bytes)]),
  );

  const { status, stderr } = runHook([[sha, BRANCH_REF]]);

  expect(status).toBe(1);
  expect(stderr).toContain("NUL byte");
});

test("a submodule bump hidden by .gitmodules needs a review", () => {
  const before = git("rev-parse", "HEAD");
  git("update-index", "--add", "--cacheinfo", `160000,${before},sub`);
  const main = commitFile(
    ".gitmodules",
    '[submodule "sub"]\n\tpath = sub\n\turl = ./sub\n\tignore = all\n',
  );
  git("update-ref", "refs/remotes/origin/main", main);
  git("update-index", "--cacheinfo", `160000,${main},sub`);
  git("commit", "-q", "-m", "bump");

  const { status } = runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]);

  expect(status).toBe(1);
});

test.each([
  ["branch", "refs/heads/origin/main"],
  ["tag", "refs/tags/origin/main"],
  ["top-level ref", "refs/origin/main"],
])(
  "a %s named like origin/main can't make unreviewed changes pass",
  (_name, ref) => {
    const sha = commitFile("change", "one\n");
    git("update-ref", ref, sha);

    expect(runHook([[sha, BRANCH_REF]]).status).toBe(1);
  },
);

test("a different object-name abbreviation keeps a binary change's review", () => {
  const sha = commitFile("change", "\0one");
  recordReview(sha);

  git("config", "core.abbrev", "12");

  expect(runHook([[sha, BRANCH_REF]]).status).toBe(0);
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

test.each([
  ["a pure rename", ""],
  ["a rename with an edit", "added\n"],
])("%s keeps its review when main edits a distant line", (_name, addition) => {
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i}\n`);
  git("merge", "-q", "--ff-only", advanceMain("tracked", lines.join("")));
  git("mv", "tracked", "renamed");
  writeFileSync(join(repo, "renamed"), lines.join("") + addition);
  git("add", "renamed");
  git("commit", "-q", "-m", "rename");
  recordReview(git("rev-parse", "HEAD"));

  const edited = lines.map((line, i) => (i === 2 ? "edited\n" : line)).join("");
  git(
    "-c",
    "merge.ff=false",
    "merge",
    "-q",
    "--no-edit",
    advanceMain("tracked", edited),
  );

  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(0);
});

test("a rename keeps its review when main's edit moves its similarity", () => {
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

test("renaming to a different name needs its own review", () => {
  const main = advanceMain("tracked", "line\n".repeat(40));
  git("merge", "-q", "--ff-only", main);
  git("mv", "tracked", "first");
  git("commit", "-q", "-m", "first");
  recordReview(git("rev-parse", "HEAD"));

  git("mv", "first", "second");
  git("commit", "-q", "-m", "second");

  expect(runHook([[git("rev-parse", "HEAD"), BRANCH_REF]]).status).toBe(1);
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

test.each([
  ["a tag", "HEAD", "refs/tags/v1"],
  ["a deleted branch", NO_COMMIT, "refs/heads/a"],
  [
    "a branch with nothing beyond main",
    "refs/remotes/origin/main",
    "refs/heads/a",
  ],
])("%s doesn't excuse an unreviewed branch after it", (_name, rev, ref) => {
  const sha = commitFile("change", "one\n");

  const { status } = runHook([
    [git("rev-parse", rev), ref],
    [sha, BRANCH_REF],
  ]);

  expect(status).toBe(1);
});

test("a local ref holding a space is refused rather than misread", () => {
  const sha = commitFile("change", "one\n");

  const { status, stderr } = hookWithInput(
    `HEAD@{1 minute ago} ${sha} ${BRANCH_REF} ${NO_COMMIT}\n`,
  );

  expect(status).toBe(1);
  expect(stderr).toContain("could not read");
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
