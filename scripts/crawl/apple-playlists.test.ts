import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  ApplePlaylistsError,
  fetchPlaylists,
  resizeArtwork,
} from "./apple-playlists";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/playlists-kr.json",
);

async function loadFixture(): Promise<string> {
  return readFile(FIXTURE_PATH, "utf8");
}

function fakeFetch(response: {
  ok: boolean;
  status?: number;
  body: string;
}): typeof fetch {
  return (async () =>
    new Response(response.body, {
      status: response.status ?? (response.ok ? 200 : 500),
    })) as typeof fetch;
}

test("maps every playlist in the captured kr fixture", async () => {
  const body = await loadFixture();
  const raw = JSON.parse(body).feed.results;

  const playlists = await fetchPlaylists("kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(playlists).toHaveLength(raw.length);
  expect(playlists[0]).toEqual({
    id: raw[0].id,
    name: raw[0].name,
    appleUrl: raw[0].url,
    artworkUrl: resizeArtwork(raw[0].artworkUrl100),
  });
});

test("requests the playlists feed at the depth ceiling", async () => {
  const body = await loadFixture();
  const seen: string[] = [];
  const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  await fetchPlaylists("kr", { fetch: spyFetch });

  expect(seen).toEqual([
    "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/playlists.json",
  ]);
});

test("throws when the feed returns no playlists", async () => {
  const body = JSON.stringify({ feed: { results: [] } });

  await expect(
    fetchPlaylists("kr", { fetch: fakeFetch({ ok: true, body }) }),
  ).rejects.toMatchObject({ name: "ApplePlaylistsError", cc: "kr" });
});

test("throws on non-OK status", async () => {
  await expect(
    fetchPlaylists("kr", {
      fetch: fakeFetch({ ok: false, status: 503, body: "" }),
    }),
  ).rejects.toBeInstanceOf(ApplePlaylistsError);
});

test("throws on invalid JSON", async () => {
  await expect(
    fetchPlaylists("kr", { fetch: fakeFetch({ ok: true, body: "not json" }) }),
  ).rejects.toBeInstanceOf(ApplePlaylistsError);
});

test("throws when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("boom");
  }) as typeof fetch;

  await expect(
    fetchPlaylists("kr", { fetch: failingFetch }),
  ).rejects.toBeInstanceOf(ApplePlaylistsError);
});

test.each([
  ["100x100SC.DN01.jpg?l=ko-KR", "600x600SC.DN01.jpg?l=ko-KR"],
  ["100x100SC.FPESS04.jpg?l=ko-KR", "600x600SC.FPESS04.jpg?l=ko-KR"],
  ["100x25cc.jpg", "600x600cc.jpg"],
  ["100x100bb.jpg", "600x600bb.jpg"],
])(
  "resizeArtwork rewrites %s without touching its template code",
  (from, to) => {
    const base =
      "https://is1-ssl.mzstatic.com/image/thumb/Features/v4/a/b/c.png";

    expect(resizeArtwork(`${base}/${from}`)).toBe(`${base}/${to}`);
  },
);

test("resizeArtwork leaves a URL with no dimension segment alone", () => {
  const url = "https://is1-ssl.mzstatic.com/image/thumb/cover.jpg";

  expect(resizeArtwork(url)).toBe(url);
});

test("every fixture artwork URL resizes to the requested dimensions", async () => {
  const raw = JSON.parse(await loadFixture()).feed.results;

  const resized = raw.map((r: { artworkUrl100: string }) =>
    resizeArtwork(r.artworkUrl100),
  );

  expect(resized.every((url: string) => url.includes("/600x600"))).toBe(true);
});
