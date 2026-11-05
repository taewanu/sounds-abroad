export type PullRequest = {
  state: string;
  isDraft: boolean;
  mergeStateStatus: string;
  labels: string[];
  body: string;
  headSha: string;
  coderabbitConclusion: string | null;
  diff: string;
};

export type Tier = "low" | "medium" | "high";

export type ShipCheck = {
  verdict: "merge-ok" | "park";
  tier: Tier;
  reason: string;
};

const HUMAN_ONLY_PATHS = [
  /^src\/lib\/chart-schema\.ts$/,
  /^src\/app\/c\//,
  /^\.github\//,
  /^\.husky\//,
  /^\.claude\/(hooks|settings)/,
  /^\.claude\/skills\/ship\//,
  /^scripts\/ship\//,
  /^(AGENTS|CLAUDE)\.md$/,
  /^\.coderabbit\.yaml$/,
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|mise\.)/,
  /^(eslint|vitest|next)\.config\./,
  /^tsconfig/,
];

const CACHE_LIFETIME_WORDS =
  /cacheLife|revalidate|max-age|s-maxage|stale-while-revalidate|Cache-Control|CACHE_MAX_AGE|CHART_LIFETIME/;

function changedFiles(diff: string): string[] {
  return [...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap(
    ([, from, to]) => [from, to],
  );
}

function changedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => /^[-+]/.test(line) && !/^(---|\+\+\+) /.test(line));
}

function isLowRiskFile(file: string): boolean {
  return file === "README.md" || /\.test\.tsx?$/.test(file);
}

export function riskTier({ body, diff }: PullRequest): Tier {
  const files = changedFiles(diff);
  if (!/^Door: two-way\s*$/m.test(body)) return "high";
  if (files.length === 0) return "high";
  if (files.some((file) => HUMAN_ONLY_PATHS.some((path) => path.test(file)))) {
    return "high";
  }
  if (changedLines(diff).some((line) => CACHE_LIFETIME_WORDS.test(line))) {
    return "high";
  }
  return files.every(isLowRiskFile) ? "low" : "medium";
}

export function shipCheck(pr: PullRequest): ShipCheck {
  const tier = riskTier(pr);
  const park = (reason: string): ShipCheck => ({
    verdict: "park",
    tier,
    reason,
  });

  if (pr.state !== "OPEN" || pr.isDraft) return park("not open for merge");
  if (pr.labels.includes("hold")) return park("hold label");
  if (pr.mergeStateStatus !== "CLEAN") {
    return park(`GitHub reports ${pr.mergeStateStatus}`);
  }
  if (tier === "high") return park("a human merges this tier");
  if (tier === "medium" && pr.coderabbitConclusion !== "success") {
    return park(
      `CodeRabbit on the latest commit: ${pr.coderabbitConclusion ?? "no check"}`,
    );
  }
  return { verdict: "merge-ok", tier, reason: "all checks passed" };
}

export function formatShipCheck(pr: PullRequest): string {
  const { verdict, tier, reason } = shipCheck(pr);
  return `ship check: ${verdict} | tier ${tier} | head ${pr.headSha.slice(0, 7)} | ${reason}`;
}
