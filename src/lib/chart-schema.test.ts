import { expect, test } from "vitest";

import fixture from "./__fixtures__/charts.json";
import { ChartFileSchema } from "./chart-schema";

test("ChartFileSchema parses the hand-crafted fixture", () => {
  expect(() => ChartFileSchema.parse(fixture)).not.toThrow();
});

test("ChartFileSchema accepts null previewUrl (placeholder for lookup-failed tracks)", () => {
  const withNullPreview = {
    lastUpdated: "2026-05-16T00:00:00.000Z",
    countries: {
      kr: {
        name: "South Korea",
        valid: true,
        tracks: [
          {
            rank: 1,
            name: "Test",
            artist: "Test Artist",
            previewUrl: null,
            artworkUrl: "https://art/600x600bb.jpg",
            appleUrl: "https://music.apple.com/kr/1",
            spotifySearchUrl: "https://open.spotify.com/search/Test",
          },
        ],
      },
    },
  };

  expect(() => ChartFileSchema.parse(withNullPreview)).not.toThrow();
});
