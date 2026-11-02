import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const HOOK = join(__dirname, "require-pre-pr.py");
const BLOCKED = 2;
const ALLOWED = 0;

let home: string;
let repo: string;
let elsewhere: string;
let heading: string;

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

function markPushed(branch: string, sha: string) {
  git("update-ref", `refs/remotes/origin/${branch}`, sha);
}

function runHook(command: string, cwd = repo) {
  const input = JSON.stringify({ tool_input: { command }, cwd });
  return spawnSync("python3", [HOOK], {
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "pre-pr-"));
  repo = join(home, "repo");
  elsewhere = join(home, "elsewhere");
  execFileSync("git", ["init", "-q", "-b", "reviewed", repo]);
  execFileSync("git", ["init", "-q", "-b", "other", elsewhere]);
  const sha = commit("reviewed");
  markPushed("reviewed", sha);
  heading = `## Pre-PR review (${sha.slice(0, 7)})`;
  writeFileSync(join(repo, "reviewed.md"), `Summary\n\n${heading}\n\n- ok\n`);
  writeFileSync(join(repo, "unreviewed.md"), "Summary\n");
  writeFileSync(
    join(repo, "quoted.md"),
    `Mentions ${heading} inside a sentence.\n`,
  );
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("a PR with no review of its commit", () => {
  test.each([
    "gh pr create --title t",
    "gh pr new --title t",
    "gh pr create --body-file unreviewed.md",
    "gh pr create -F unreviewed.md",
    "gh pr create --body-file missing.md",
    "gh pr create --body-file quoted.md",
    "gh pr create --body-file -",
    "gh pr create --body nothing",
    "gh -R owner/repo pr create",
    "gh --repo owner/repo pr create",
    "gh pr -R owner/repo create",
    "GH_REPO=owner/repo gh pr create",
    "env GH_REPO=owner/repo gh pr create",
    "command gh pr create",
    "/usr/local/bin/gh pr create",
    "true; gh pr create",
    "true && gh pr create",
    "(gh pr create)",
    "true\ngh pr create",
    "gh pr \\\n  create",
    "gh pr create --title 'it''s",
    'gh pr create --title "unterminated',
  ])("is blocked: %s", (command) => {
    expect(runHook(command).status).toBe(BLOCKED);
  });

  test("is blocked when the heading is only in the title", () => {
    const command = `gh pr create --title '${heading}' --body-file unreviewed.md`;

    expect(runHook(command).status).toBe(BLOCKED);
  });

  test("is blocked when the worktree it changes into has no such review", () => {
    const command = `cd ${repo} && gh pr create --body-file unreviewed.md`;

    expect(runHook(command, elsewhere).status).toBe(BLOCKED);
  });

  test("names the section to add", () => {
    const { stderr } = runHook("gh pr create --body-file unreviewed.md");

    expect(stderr).toContain(heading);
  });
});

describe("a PR with a review of its commit", () => {
  test.each([
    ["a body file", "gh pr create --body-file reviewed.md"],
    ["a short body file flag", "gh pr create -F reviewed.md"],
    ["an equals form", "gh pr create --body-file=reviewed.md"],
    [
      "an unrelated -H in the title",
      "gh pr create --title 'drop -H flag' -F reviewed.md",
    ],
    [
      "an unrelated -F in the title",
      "gh pr create --title 'use -F x' --body-file reviewed.md",
    ],
  ])("is allowed with %s", (_name, command) => {
    expect(runHook(command).status).toBe(ALLOWED);
  });

  test("is allowed with an inline body", () => {
    const command = `gh pr create --body '${heading}'`;

    expect(runHook(command).status).toBe(ALLOWED);
  });

  test("is allowed with a heredoc body", () => {
    const command = `gh pr create --body-file - <<'EOF'\n${heading}\nEOF`;

    expect(runHook(command).status).toBe(ALLOWED);
  });

  test("is allowed with a heredoc inside a command substitution", () => {
    const command = `gh pr create --body "$(cat <<'EOF'\n${heading}\nEOF\n)"`;

    expect(runHook(command).status).toBe(ALLOWED);
  });

  test("is allowed from another directory through cd", () => {
    const command = `cd ${repo} && gh pr create -F reviewed.md`;

    expect(runHook(command, elsewhere).status).toBe(ALLOWED);
  });

  test("is allowed through a cd using the home directory", () => {
    const command = "cd ~/repo && gh pr create -F reviewed.md";

    expect(runHook(command, elsewhere).status).toBe(ALLOWED);
  });

  test("is allowed when the branch tracks a different upstream", () => {
    git("config", "branch.reviewed.remote", "origin");
    git("config", "branch.reviewed.merge", "refs/heads/main");

    expect(runHook("gh pr create -F reviewed.md").status).toBe(ALLOWED);
  });

  test("is blocked once a new commit makes the review stale", () => {
    const before = git("rev-parse", "HEAD");
    const sha = commit("newer");
    markPushed("reviewed", sha);

    const { status } = runHook("gh pr create -F reviewed.md");

    git("update-ref", "refs/heads/reviewed", before);
    markPushed("reviewed", before);
    expect(status).toBe(BLOCKED);
  });

  test("is blocked until the reviewed commit is on origin", () => {
    const pushed = git("rev-parse", "HEAD");
    git("update-ref", "-d", "refs/remotes/origin/reviewed");

    const { status, stderr } = runHook("gh pr create -F reviewed.md");

    markPushed("reviewed", pushed);
    expect(status).toBe(BLOCKED);
    expect(stderr).toContain("Push it first");
  });

  test("checks the named branch rather than the checked-out one", () => {
    const reviewed = git("rev-parse", "HEAD");
    git("branch", "named", reviewed);
    markPushed("named", reviewed);
    const command = `gh pr create --head named -F ${join(repo, "reviewed.md")}`;

    expect(runHook(command, repo).status).toBe(ALLOWED);
    expect(
      runHook(`gh pr create --head owner:named -F ${join(repo, "reviewed.md")}`)
        .status,
    ).toBe(ALLOWED);
  });
});

describe("commands that open no PR", () => {
  test.each([
    "git status",
    "gh pr view 1",
    "gh pr merge 1 --squash",
    "gh pr create --help",
    "gh pr create -h",
    "echo gh pr create",
    "grep -rn 'gh pr create' docs",
    "git commit -m 'mention gh pr create'",
    "git commit -m 'first\ngh pr create\nlast'",
    "git commit -F - <<'EOF'\ngh pr create\nEOF",
    "cat > note.md <<EOF\ngh pr create --title t\nEOF",
    "cat <<< 'gh pr create'",
    "echo done # gh pr create",
    "brightdata-gh pr create",
    'echo "unterminated',
  ])("passes: %s", (command) => {
    expect(runHook(command).status).toBe(ALLOWED);
  });
});
