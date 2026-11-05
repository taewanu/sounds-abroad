import { execFileSync } from "node:child_process";

import { formatShipCheck } from "./check";

const MAX_DIFF_BYTES = 64 * 1024 * 1024;

type GhPullRequest = {
  state: string;
  isDraft: boolean;
  mergeStateStatus: string;
  labels: { name: string }[];
  body: string;
  headRefOid: string;
  reviews: { author: { login: string }; commit: { oid: string } }[];
};

function gh(...args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: MAX_DIFF_BYTES,
  });
}

const number = process.argv[2];
if (!number || !/^\d+$/.test(number)) {
  throw new Error("Usage: pnpm ship <pr-number>");
}

const pr = JSON.parse(
  gh(
    "pr",
    "view",
    number,
    "--json",
    "state,isDraft,mergeStateStatus,labels,body,headRefOid,reviews",
  ),
) as GhPullRequest;

console.log(
  formatShipCheck({
    state: pr.state,
    isDraft: pr.isDraft,
    mergeStateStatus: pr.mergeStateStatus,
    labels: pr.labels.map(({ name }) => name),
    body: pr.body,
    headSha: pr.headRefOid,
    reviews: pr.reviews.map(({ author, commit }) => ({
      login: author.login,
      commitSha: commit.oid,
    })),
    diff: gh("pr", "diff", number),
  }),
);
