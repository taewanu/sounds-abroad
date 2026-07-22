import { expect, test } from "vitest";

import { spotifySearchUrl } from "./spotify-search-url";

test("spotifySearchUrl builds a search link from the name and artist", () => {
  expect(spotifySearchUrl("Ice Cream", "연준")).toBe(
    "https://open.spotify.com/search/Ice%20Cream%20%EC%97%B0%EC%A4%80",
  );
});

test("spotifySearchUrl escapes characters that would break the path", () => {
  const url = spotifySearchUrl("A/B?C", "D&E");

  expect(url.startsWith("https://open.spotify.com/search/")).toBe(true);
  expect(url).not.toContain("?");
  expect(url).not.toContain("&");
});
