import { afterEach, expect, test, vi } from "vitest";
import fixture from "./__fixtures__/charts.json";
import {
  ChartsFetchError,
  ChartsValidationError,
  fetchCharts,
} from "./charts-client";

const FIXTURE_URL =
  "https://store.public.blob.vercel-storage.com/charts/v1/charts.json";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: Response): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

test("fetchCharts returns parsed ChartFile when body matches schema", async () => {
  mockFetch(
    new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  const result = await fetchCharts(FIXTURE_URL);

  expect(result.countries.kr.tracks[0].rank).toBe(1);
  expect(result.countries.kr.tracks[0].artist).toBe("악뮤");
  expect(result.lastUpdated).toBe("2026-04-25T03:00:00Z");
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
