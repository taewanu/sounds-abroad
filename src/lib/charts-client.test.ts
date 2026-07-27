import { afterEach, beforeEach, expect, test, vi } from "vitest";

import fixture from "./__fixtures__/charts.json";
import { MUSIC_CHARTS_TAG } from "./cache-tags";
import {
  ChartsFetchError,
  ChartsValidationError,
  fetchCharts,
} from "./charts-client";

const FIXTURE_URL = "https://data.example.com/charts/v1/charts.json";

afterEach(() => {
  vi.restoreAllMocks();
});

// The helper reads `process.env` per request, so a key present in the shell or in
// CI would make the no-key assertions below expect an empty header set while the
// request correctly carried one. Cleared per test and restored after, rather than
// saved by hand inside each test, so a later test cannot forget to.
const KEY_OUTSIDE = process.env.CHARTS_READ_KEY;

beforeEach(() => {
  delete process.env.CHARTS_READ_KEY;
});

afterEach(() => {
  if (KEY_OUTSIDE === undefined) delete process.env.CHARTS_READ_KEY;
  else process.env.CHARTS_READ_KEY = KEY_OUTSIDE;
});

function mockFetch(response: Response): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

test("fetchCharts returns parsed ChartFile when body matches schema", async () => {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  const result = await fetchCharts(FIXTURE_URL);

  expect(result.countries.kr.tracks[0].rank).toBe(1);
  expect(result.countries.kr.tracks[0].artist).toBe("악뮤");
  expect(result.lastUpdated).toBe("2026-04-25T03:00:00Z");
  expect(spy).toHaveBeenCalledWith(FIXTURE_URL, {
    cache: "force-cache",
    next: { tags: [MUSIC_CHARTS_TAG] },
    // Empty with no key configured, which is how this suite runs. What it
    // carries when one is set has its own test below.
    headers: {},
  });
});

test("fetchCharts throws ChartsValidationError when payload is malformed", async () => {
  const malformed = { countries: fixture.countries };
  mockFetch(
    new Response(JSON.stringify(malformed), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await expect(fetchCharts(FIXTURE_URL)).rejects.toBeInstanceOf(
    ChartsValidationError,
  );
});

test("fetchCharts throws ChartsFetchError on non-OK status", async () => {
  mockFetch(new Response(null, { status: 500, statusText: "Server Error" }));

  await expect(fetchCharts(FIXTURE_URL)).rejects.toBeInstanceOf(
    ChartsFetchError,
  );
});

test("fetchCharts throws ChartsFetchError when fetch rejects (network error)", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new TypeError("fetch failed"),
  );

  await expect(fetchCharts(FIXTURE_URL)).rejects.toBeInstanceOf(
    ChartsFetchError,
  );
});

test("fetchCharts throws ChartsFetchError when body is not valid JSON", async () => {
  mockFetch(
    new Response("not json at all", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await expect(fetchCharts(FIXTURE_URL)).rejects.toBeInstanceOf(
    ChartsFetchError,
  );
});

// The busiest read of the store, and the one the whole payload comes through, so
// a credential missing here breaks the home route and every country page rather
// than a single chart. It was missing until review caught it.
test("fetchCharts carries the store credential when one is configured", async () => {
  process.env.CHARTS_READ_KEY = "a-secret";
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await fetchCharts(FIXTURE_URL);

  const init = spy.mock.calls[0][1] as RequestInit;
  expect(init.headers).toMatchObject({ "x-charts-key": "a-secret" });
  // The credential must not cost the caching the read depends on.
  expect(init.cache).toBe("force-cache");
  expect(init.next).toEqual({ tags: [MUSIC_CHARTS_TAG] });
});
