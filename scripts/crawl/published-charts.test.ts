import { expect, test } from "vitest";

import type { ChartFile } from "../../src/lib/chart-schema";

import { fetchPublishedCharts } from "./published-charts";

const URL = "https://blob/charts/v1/charts.json";

function validChartFile(): ChartFile {
  return {
    lastUpdated: "2026-05-14T12:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "song",
            artist: "artist",
            previewUrl: "https://preview/1.m4a",
            artworkUrl: "https://art/1/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/song",
          },
        ],
      },
    },
  };
}

function fakeFetch(response: {
  ok?: boolean;
  status?: number;
  body: string;
}): typeof fetch {
  return (async () =>
    new Response(response.body, {
      status: response.status ?? (response.ok === false ? 500 : 200),
    })) as typeof fetch;
}

test("returns the parsed payload on a valid response", async () => {
  const chartFile = validChartFile();

  const result = await fetchPublishedCharts(
    URL,
    fakeFetch({ body: JSON.stringify(chartFile) }),
  );

  expect(result).toEqual(chartFile);
});

test("returns null on a non-OK response", async () => {
  const result = await fetchPublishedCharts(
    URL,
    fakeFetch({ ok: false, status: 404, body: "Not Found" }),
  );

  expect(result).toBeNull();
});

test("returns null on invalid JSON", async () => {
  const result = await fetchPublishedCharts(
    URL,
    fakeFetch({ body: "<html>nope</html>" }),
  );

  expect(result).toBeNull();
});

test("returns null on schema mismatch", async () => {
  const result = await fetchPublishedCharts(
    URL,
    fakeFetch({ body: JSON.stringify({ lastUpdated: "nope", countries: 5 }) }),
  );

  expect(result).toBeNull();
});

test("returns null when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("network down");
  }) as typeof fetch;

  const result = await fetchPublishedCharts(URL, failingFetch);

  expect(result).toBeNull();
});
