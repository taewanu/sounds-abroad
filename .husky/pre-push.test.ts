import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

const HOOK = join(__dirname, "pre-push");
const NO_COMMIT = "0".repeat(40);

let repo: string;
let unreviewed: string;
let reviewed: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args],
    { encoding: "utf8" },
  ).trim();
}

function commit(message: string): string {
  git("commit", "--allow-empty", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

function push(sha: string, remoteRef = "refs/heads/feature") {
  return spawnSync("sh", [HOOK], {
    cwd: repo,
    encoding: "utf8",
    input: `refs/heads/feature ${sha} ${remoteRef} ${NO_COMMIT}\n`,
  });
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "pre-push-"));
  execFileSync("git", ["init", "-q", repo]);
  reviewed = commit("reviewed");
  unreviewed = commit("unreviewed");
  const records = join(repo, ".git", "pre-pr-reviewed");
  mkdirSync(records);
  writeFileSync(join(records, reviewed), "");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("a reviewed commit pushes", () => {
  expect(push(reviewed).status).toBe(0);
});

test("a commit with no recorded review is refused, naming the commit", () => {
  const { status, stderr } = push(unreviewed);

  expect(status).toBe(1);
  expect(stderr).toContain(unreviewed.slice(0, 7));
});

test("one unreviewed branch refuses the whole push", () => {
  const input = [
    `refs/heads/a ${reviewed} refs/heads/a ${NO_COMMIT}`,
    `refs/heads/b ${unreviewed} refs/heads/b ${NO_COMMIT}`,
    "",
  ].join("\n");

  const { status } = spawnSync("sh", [HOOK], {
    cwd: repo,
    encoding: "utf8",
    input,
  });

  expect(status).toBe(1);
});

test("deleting a branch needs no review", () => {
  expect(push(NO_COMMIT).status).toBe(0);
});

test("pushing a tag needs no review", () => {
  expect(push(unreviewed, "refs/tags/v1").status).toBe(0);
});
