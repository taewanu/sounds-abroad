import { z } from "zod";

import { ChartFileSchema } from "../../src/lib/chart-schema";
import { CHARTS_ROUTE } from "../../src/lib/charts-client";

const HealthSchema = z.object({ sha: z.string().nullable() });
const ChartFreshnessSchema = ChartFileSchema.pick({ lastUpdated: true });

const HOUR_MS = 60 * 60 * 1000;

// Publishes landed 6.8h apart at the median over 60 runs to 2026-11-04, so an
// older chart means a crawl is late or missed. One scheduler delay reached 12.8h.
export const MAX_CHART_AGE_MS = 12 * HOUR_MS;

// The first read after a crawl's revalidation gets the previous file while the
// new one regenerates, so one old read doesn't yet prove the chart is stale.
const REREAD_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

interface CheckResult {
  passed: boolean;
  detail: string;
}

const passed = (detail: string): CheckResult => ({ passed: true, detail });
const failed = (detail: string): CheckResult => ({ passed: false, detail });

function reasonOf(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error);
  return error instanceof Error ? error.message : String(error);
}

async function readJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`answered ${response.status}`);
    return schema.parse(await response.json());
  } catch (error) {
    throw new Error(`${url}: ${reasonOf(error)}`, { cause: error });
  }
}

async function checkCommit(
  origin: string,
  expectedSha: string,
): Promise<CheckResult> {
  const { sha } = await readJson(`${origin}/api/health`, HealthSchema);
  if (!sha) return failed("deployment reports no commit");
  return sha.startsWith(expectedSha)
    ? passed(`deployed ${sha}`)
    : failed(`deployed ${sha}, expected ${expectedSha}`);
}

async function checkChartAge(
  origin: string,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
): Promise<CheckResult> {
  const readAge = async (): Promise<number> => {
    const { lastUpdated } = await readJson(
      `${origin}${CHARTS_ROUTE}`,
      ChartFreshnessSchema,
    );
    return now() - Date.parse(lastUpdated);
  };

  let age = await readAge();
  if (age > MAX_CHART_AGE_MS) {
    await sleep(REREAD_DELAY_MS);
    age = await readAge();
  }

  const detail = `chart is ${(age / HOUR_MS).toFixed(1)}h old`;
  return age > MAX_CHART_AGE_MS ? failed(detail) : passed(detail);
}

/** Checks one deployment's commit and chart age; one failing doesn't hide the other. */
export async function checkHealth({
  origin,
  expectedSha,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  origin: string;
  expectedSha: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CheckResult[]> {
  const settle = (check: Promise<CheckResult>): Promise<CheckResult> =>
    check.catch((error: unknown) => failed(reasonOf(error)));

  return [
    await settle(checkCommit(origin, expectedSha)),
    await settle(checkChartAge(origin, now, sleep)),
  ];
}
