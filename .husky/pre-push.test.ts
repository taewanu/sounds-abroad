import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

const HOOK = join(__dirname, "pre-push");

let root: string;
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

function commitFile(name: string, content = `${name}\n`) {
  writeFileSync(join(repo, name), content);
  git("add", name);
  git("commit", "-q", "-m", name);
}

function recordReview(branch = "feature") {
  git("config", `branch.${branch}.prePrReviewed`, git("rev-parse", branch));
}

function push(...args: string[]) {
  return spawnSync("git", ["-C", repo, "push", "-q", "origin", ...args], {
    encoding: "utf8",
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pre-push-"));
  repo = join(root, "repo");
  const remote = join(root, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("remote", "add", "origin", remote);

  // Husky runs hooks under `sh -e` from a generated wrapper that a fresh repository doesn't have.
  const wrapper = join(root, "hooks", "pre-push");
  mkdirSync(join(root, "hooks"));
  writeFileSync(wrapper, `#!/bin/sh\nexec sh -e "${HOOK}"\n`);
  chmodSync(wrapper, 0o755);
  git("config", "core.hooksPath", join(root, "hooks"));

  commitFile("base");
  git("switch", "-q", "-c", "feature");
  commitFile("change");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("a branch's first push is refused without a review, naming the branch", () => {
  const { status, stderr } = push("feature");

  expect(status).toBe(1);
  expect(stderr).toContain("no /pre-pr review recorded for feature");
  expect(git("ls-remote", "origin", "refs/heads/feature")).toBe("");
});

test("a branch's first push passes with a review", () => {
  recordReview();

  expect(push("feature").status).toBe(0);
});

test("commits made after the review don't need another before the first push", () => {
  recordReview();
  commitFile("later");

  expect(push("feature").status).toBe(0);
});

test("later pushes to a branch the remote has need no review", () => {
  recordReview();
  push("feature");
  git("config", "--unset", "branch.feature.prePrReviewed");
  commitFile("answer-to-review");

  expect(push("feature").status).toBe(0);
});

test("a review recorded in one worktree counts in another", () => {
  recordReview();
  const linked = join(root, "linked");
  git("worktree", "add", "-q", linked, "-b", "other");
  git("config", "branch.other.prePrReviewed", "reviewed");

  const { status } = spawnSync(
    "git",
    ["-C", linked, "push", "-q", "origin", "other"],
    { encoding: "utf8" },
  );

  expect(status).toBe(0);
});

test("deleting a branch drops its review, so a reused name needs a new one", () => {
  recordReview();
  git("switch", "-q", "main");
  git("branch", "-q", "-D", "feature");
  git("switch", "-q", "-c", "feature");
  commitFile("unrelated");

  expect(push("feature").status).toBe(1);
});

test("pushing HEAD to a new branch checks the current branch's review", () => {
  expect(push("HEAD:refs/heads/renamed").status).toBe(1);

  recordReview();

  expect(push("HEAD:refs/heads/renamed").status).toBe(0);
});

test("a detached commit's first push is refused", () => {
  recordReview();
  git("switch", "-q", "--detach");

  const { status, stderr } = push("HEAD:refs/heads/renamed");

  expect(status).toBe(1);
  expect(stderr).toContain("detached");
});

test("one unreviewed branch refuses the whole push", () => {
  recordReview();
  git("branch", "unreviewed");

  expect(push("feature", "unreviewed").status).toBe(1);
  expect(git("ls-remote", "origin", "refs/heads/feature")).toBe("");
});

test("deleting a remote branch needs no review", () => {
  recordReview();
  push("feature");
  git("config", "--unset", "branch.feature.prePrReviewed");

  expect(push("--delete", "feature").status).toBe(0);
});

test("pushing a tag needs no review", () => {
  git("tag", "v1");

  expect(push("v1").status).toBe(0);
});
