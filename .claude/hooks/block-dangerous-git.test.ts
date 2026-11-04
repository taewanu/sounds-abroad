import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const HOOK = join(__dirname, "block-dangerous-git.sh");
const BLOCKED = 2;
const ALLOWED = 0;

let onMain: string;
let onFeature: string;

function createRepoOnBranch(branch: string): string {
  const repo = mkdtempSync(join(tmpdir(), "hook-push-"));
  spawnSync("git", ["-C", repo, "init", "-q", "-b", branch]);
  return repo;
}

beforeAll(() => {
  onMain = createRepoOnBranch("main");
  onFeature = createRepoOnBranch("feature");
});

afterAll(() => {
  rmSync(onMain, { recursive: true, force: true });
  rmSync(onFeature, { recursive: true, force: true });
});

function runHook(command: string, cwd = onFeature): number | null {
  const input = JSON.stringify({ tool_input: { command }, cwd });
  return spawnSync("bash", [HOOK], { input, encoding: "utf8" }).status;
}

test.each([
  "git push",
  "git push -u",
  "git push origin",
  "git push origin HEAD",
  "git push origin feature",
])("blocks any push from a checked-out main: %s", (command) => {
  expect(runHook(command, onMain)).toBe(BLOCKED);
});

test.each([
  "git -C /tmp/x push",
  "git -C /tmp/x push origin feature",
  "git --git-dir=/tmp/x push",
  "git -C /tmp/x \\\n  push",
  "cd /tmp/x && git push",
  "cd /tmp/x; git push origin feature",
])("blocks a push aimed at a repository the hook can't see: %s", (command) => {
  expect(runHook(command)).toBe(BLOCKED);
});

describe("commands the hook blocks", () => {
  test.each([
    "git push origin main",
    "git push -u origin main",
    "git push origin feature:main",
    "git push origin refs/heads/main",
    "git push --force",
    "git push -f origin feature",
    "git push -uf origin feature",
    "git push --force-with-lease",
    "git push origin +feature",
    "git push origin :feature",
    "git push origin --delete feature",
    "git push --mirror",
    "git push --all",
    "true; git push --force",
    "git push origin 'feature:main'",
    "git push origin '+feature'",
    "git push '--force'",
    "git -C /tmp/x push origin 'main'",
    "(git push origin main)",
    "sh -c 'git push origin main'",
    "git clean -f",
    "git clean -fd",
    "git clean -df",
    "git clean -xdf",
    "git clean -d -f",
    "git clean --force",
    "git clean -fe_build",
    "git clean -fdxe_tmp",
    "git reset --hard",
    "git reset -q --hard HEAD",
    "git branch -D old",
    "git branch -D_old",
    "git branch -df old",
    "git branch --delete --force old",
    "git branch --force --delete old",
    "git branch -d -f old",
    "git branch -f -d old",
    "git branch -d --force old",
    "git branch -vdf old",
    "git checkout .",
    "git checkout -- .",
    "git restore .",
    "git restore -- .",
    "git restore -q .",
    "git restore --worktree .",
    "git restore --staged --worktree .",
    "git restore -SW .",
    "git restore -q . && git diff --staged",
    "cd my-Site && git restore -q .",
    "git -C /tmp/x push --force",
    'git -C "/tmp/a b" push --force',
    "git -C $(pwd) push --force",
    "git -C $(dirname $(pwd)) push --force",
    'git -C ~/"my dir" push --force',
    "git -C /a\\ b push --force",
    'git -C "/a b"/c push --force',
    "git --shallow-file /tmp/x push --force",
    "git -c a=b -C /tmp/x push origin main",
    "git --no-pager --git-dir=/tmp/x push --force",
    "git --git-dir /tmp/x push --force",
    "git\t-C /tmp/x\tpush --force",
    "git -C /tmp/x \\\n  push --force",
    "/usr/bin/git -C /tmp/x push --force",
    "git -C /tmp/x clean -fd",
    "git -C /tmp/x clean -fe_build",
    "git -C /tmp/x branch -D old",
    "git -C /tmp/x reset --hard",
    "git -C /tmp/x checkout .",
    "git -C /tmp/x restore .",
    "sh -c 'git -C /tmp/x push --force'",
  ])("%s", (command) => {
    expect(runHook(command)).toBe(BLOCKED);
  });
});

describe("commands the hook allows", () => {
  test.each([
    "git push",
    "git push origin feature",
    "git push -u origin chore/some-change",
    "git push origin fix-foo",
    "git push origin mainline",
    "git push --dry-run origin feature",
    "git status",
    "git -C /tmp/x status",
    "git -C /tmp/x log --oneline",
    "git log --grep=push",
    "git stash push",
    "git -C /tmp/x stash push -m wip",
    "git --git-dir push status",
    "git --version; pushd /tmp",
    "git remote -v",
    "git branch -d old",
    "git clean -n",
    "git ls-remote origin refs/heads/main",
    "git add . && git commit -m wip",
    "git restore file.ts",
    "git restore --staged .",
    "git restore --staged --source=HEAD .",
    "git restore -S .",
    "git checkout -p .",
    "git checkout main",
    "gh pr view 1",
  ])("%s", (command) => {
    expect(runHook(command)).toBe(ALLOWED);
  });
});
