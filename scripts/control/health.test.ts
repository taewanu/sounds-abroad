import { afterEach, describe, expect, test, vi } from "vitest";

import { CHARTS_ROUTE } from "../../src/lib/charts-client";

import { checkHealth, MAX_CHART_AGE_MS } from "./health";

const ORIGIN = "https://deployment.test";
const HEALTH_URL = `${ORIGIN}/api/health`;
const CHARTS_URL = `${ORIGIN}${CHARTS_ROUTE}`;
const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const SHA = "abc1234def5678";
const HOUR_MS = 60 * 60 * 1000;

const FRESH_AGE_MS = HOUR_MS;
const STALE_AGE_MS = MAX_CHART_AGE_MS + HOUR_MS;
const chartAged = (ageMs: number): Response =>
  Response.json({ lastUpdated: new Date(NOW - ageMs).toISOString() });
const ageLine = (ageMs: number): string =>
  `chart is ${(ageMs / HOUR_MS).toFixed(1)}h old`;

/** Serves each URL's queued answers in order, repeating the last. */
function stubFetch(routes: Record<string, Response[]>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const answers = routes[url];
      const answer = answers.length > 1 ? answers.shift() : answers[0];
      return (answer as Response).clone();
    }),
  );
}

function checkDeployment(expectedSha = SHA) {
  const sleep = vi.fn(async () => undefined);
  const results = checkHealth({
    origin: ORIGIN,
    expectedSha,
    now: () => NOW,
    sleep,
  });
  return { results, sleep };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkHealth", () => {
  test("passes the expected commit and a fresh chart without waiting", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [chartAged(FRESH_AGE_MS)],
    });

    const { results, sleep } = checkDeployment();

    expect(await results).toEqual([
      { passed: true, detail: `deployed ${SHA}` },
      { passed: true, detail: ageLine(FRESH_AGE_MS) },
    ]);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("accepts an abbreviated expected commit", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [chartAged(FRESH_AGE_MS)],
    });

    const { results } = checkDeployment(SHA.slice(0, 7));

    expect((await results)[0].passed).toBe(true);
  });

  test("fails when another commit is deployed", async () => {
    const expectedSha = "fff0000";
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [chartAged(FRESH_AGE_MS)],
    });

    const { results } = checkDeployment(expectedSha);

    expect((await results)[0]).toEqual({
      passed: false,
      detail: `deployed ${SHA}, expected ${expectedSha}`,
    });
  });

  test("fails when the deployment reports no commit", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: null })],
      [CHARTS_URL]: [chartAged(FRESH_AGE_MS)],
    });

    const { results } = checkDeployment();

    expect((await results)[0]).toEqual({
      passed: false,
      detail: "deployment reports no commit",
    });
  });

  test("trusts the re-read when the first chart read is old", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [chartAged(STALE_AGE_MS), chartAged(FRESH_AGE_MS)],
    });

    const { results, sleep } = checkDeployment();

    expect((await results)[1]).toEqual({
      passed: true,
      detail: ageLine(FRESH_AGE_MS),
    });
    expect(sleep).toHaveBeenCalledOnce();
  });

  test("fails when the re-read is still past the age limit", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [chartAged(STALE_AGE_MS)],
    });

    const { results } = checkDeployment();

    expect((await results)[1]).toEqual({
      passed: false,
      detail: ageLine(STALE_AGE_MS),
    });
  });

  test("still checks the chart when the commit check errors", async () => {
    stubFetch({
      [HEALTH_URL]: [new Response("denied", { status: 401 })],
      [CHARTS_URL]: [chartAged(FRESH_AGE_MS)],
    });

    const { results } = checkDeployment();

    expect(await results).toEqual([
      { passed: false, detail: `${HEALTH_URL}: answered 401` },
      { passed: true, detail: ageLine(FRESH_AGE_MS) },
    ]);
  });

  test("still reports the commit when the chart check errors", async () => {
    stubFetch({
      [HEALTH_URL]: [Response.json({ sha: SHA })],
      [CHARTS_URL]: [new Response("denied", { status: 503 })],
    });

    const { results } = checkDeployment();

    expect(await results).toEqual([
      { passed: true, detail: `deployed ${SHA}` },
      { passed: false, detail: `${CHARTS_URL}: answered 503` },
    ]);
  });

  test("names the URL when a response isn't the expected JSON", async () => {
    stubFetch({
      [HEALTH_URL]: [new Response("<html></html>")],
      [CHARTS_URL]: [Response.json({})],
    });

    const { results } = checkDeployment();

    const [commit, chart] = await results;
    expect(commit.passed).toBe(false);
    expect(commit.detail).toContain(HEALTH_URL);
    expect(chart.passed).toBe(false);
    expect(chart.detail).toContain(CHARTS_URL);
  });
});
