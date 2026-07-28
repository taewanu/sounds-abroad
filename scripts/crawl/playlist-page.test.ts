import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  fetchPlaylistPage,
  parsePlaylistPage,
  PlaylistPageError,
} from "./playlist-page";

const PLAYLIST_ID = "pl.48229b41bbfc47d7af39dae8e8b5276e";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/playlist-page-kr.json",
);

/**
 * The fixture holds the embedded block alone, not the ~700 KB page around it.
 * Telemetry keys the parser never reads were pruned when it was captured, so
 * what it pins is exactly the shape the contract depends on.
 */
async function loadServerData(): Promise<string> {
  return readFile(FIXTURE_PATH, "utf8");
}

function pageHtml(serverData: string): string {
  return [
    "<html><head><title>playlist</title></head><body>",
    `<script type="application/json" id="serialized-server-data">${serverData}</script>`,
    "</body></html>",
  ].join("");
}

function trackItems(serverData: string): unknown[] {
  const sections = JSON.parse(serverData).data[0].data.sections;
  return sections.find(
    (s: { itemKind?: string }) => s.itemKind === "trackLockup",
  ).items;
}

test("reads every track out of the captured kr playlist page", async () => {
  const serverData = await loadServerData();
  const items = trackItems(serverData) as {
    title: string;
    artistName: string;
    contentDescriptor: { identifiers: { storeAdamID: string }; url: string };
  }[];

  const tracks = parsePlaylistPage(pageHtml(serverData), PLAYLIST_ID);

  expect(tracks).toHaveLength(items.length);
  expect(tracks[0]).toMatchObject({
    rank: 1,
    id: items[0].contentDescriptor.identifiers.storeAdamID,
    name: items[0].title,
    artist: items[0].artistName,
    appleUrl: items[0].contentDescriptor.url,
  });
});

test("ranks tracks by their order in the section", async () => {
  const serverData = await loadServerData();

  const tracks = parsePlaylistPage(pageHtml(serverData), PLAYLIST_ID);

  expect(tracks.map((t) => t.rank)).toEqual(
    tracks.map((_, index) => index + 1),
  );
});

test("renders the artwork template at the requested dimensions", async () => {
  const serverData = await loadServerData();

  const tracks = parsePlaylistPage(pageHtml(serverData), PLAYLIST_ID);

  expect(tracks.every((t) => t.artworkUrl.includes("600x600"))).toBe(true);
  expect(tracks.every((t) => !t.artworkUrl.includes("{"))).toBe(true);
});

test("skips an item that no longer matches, keeping the rest", async () => {
  const serverData = await loadServerData();
  const parsed = JSON.parse(serverData);
  const section = parsed.data[0].data.sections.find(
    (s: { itemKind?: string }) => s.itemKind === "trackLockup",
  );
  const kept = section.items.length - 1;
  section.items[0] = { title: "orphan with no descriptor" };

  const tracks = parsePlaylistPage(
    pageHtml(JSON.stringify(parsed)),
    PLAYLIST_ID,
  );

  expect(tracks).toHaveLength(kept);
});

test("throws missing-block when the page carries no embedded state", () => {
  expect(() =>
    parsePlaylistPage("<html><body>nope</body></html>", PLAYLIST_ID),
  ).toThrowError(PlaylistPageError);
});

test("names the playlist on the thrown error", () => {
  expect(() => parsePlaylistPage("<html></html>", PLAYLIST_ID)).toThrowError(
    expect.objectContaining({
      playlistId: PLAYLIST_ID,
      kind: "missing-block",
    }),
  );
});

test("throws json when the embedded block is not JSON", () => {
  expect(() =>
    parsePlaylistPage(pageHtml("not json"), PLAYLIST_ID),
  ).toThrowError(expect.objectContaining({ kind: "json" }));
});

test("throws shape when the envelope no longer matches", () => {
  expect(() =>
    parsePlaylistPage(pageHtml(JSON.stringify({ data: [] })), PLAYLIST_ID),
  ).toThrowError(expect.objectContaining({ kind: "shape" }));
});

test("throws shape when no track section is present", () => {
  const serverData = JSON.stringify({
    data: [{ data: { sections: [{ itemKind: "spacer", items: [] }] } }],
  });

  expect(() =>
    parsePlaylistPage(pageHtml(serverData), PLAYLIST_ID),
  ).toThrowError(expect.objectContaining({ kind: "shape" }));
});

test("throws shape when every item in the track section is unusable", () => {
  const serverData = JSON.stringify({
    data: [
      {
        data: {
          sections: [{ itemKind: "trackLockup", items: [{ title: "orphan" }] }],
        },
      },
    ],
  });

  expect(() =>
    parsePlaylistPage(pageHtml(serverData), PLAYLIST_ID),
  ).toThrowError(expect.objectContaining({ kind: "shape" }));
});

test("fetchPlaylistPage throws http on non-OK status", async () => {
  const failingFetch: typeof fetch = (async () =>
    new Response("", { status: 404 })) as typeof fetch;

  await expect(
    fetchPlaylistPage(PLAYLIST_ID, "https://music.apple.com/kr/playlist/x", {
      fetch: failingFetch,
    }),
  ).rejects.toMatchObject({ kind: "http", playlistId: PLAYLIST_ID });
});

test("fetchPlaylistPage throws network when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("boom");
  }) as typeof fetch;

  await expect(
    fetchPlaylistPage(PLAYLIST_ID, "https://music.apple.com/kr/playlist/x", {
      fetch: failingFetch,
    }),
  ).rejects.toMatchObject({ kind: "network" });
});

test("fetchPlaylistPage requests the playlist's own URL", async () => {
  const serverData = await loadServerData();
  const appleUrl = "https://music.apple.com/kr/playlist/kpopwrld/pl.482";
  const seen: string[] = [];
  const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(pageHtml(serverData), { status: 200 });
  }) as typeof fetch;

  await fetchPlaylistPage(PLAYLIST_ID, appleUrl, { fetch: spyFetch });

  expect(seen).toEqual([appleUrl]);
});

// The URL rules are wired into the track schema, so a lockup carrying a value
// they refuse stops being usable. The parser's existing contract decides what
// that costs: one unusable item is skipped, a section with nothing left throws.
test("a track whose storefront URL is refused is skipped, keeping its section-mates", async () => {
  const data = JSON.parse(await loadServerData());
  const items = data.data[0].data.sections[1].items;
  items[0].contentDescriptor.url = "javascript:alert(1)";

  const tracks = parsePlaylistPage(pageHtml(JSON.stringify(data)), PLAYLIST_ID);

  expect(tracks).toHaveLength(items.length - 1);
});

test("a track whose artwork host is refused is skipped, keeping its section-mates", async () => {
  const data = JSON.parse(await loadServerData());
  const items = data.data[0].data.sections[1].items;
  items[0].artwork.dictionary.url = "https://evil.test/{w}x{h}bb.{f}";

  const tracks = parsePlaylistPage(pageHtml(JSON.stringify(data)), PLAYLIST_ID);

  expect(tracks).toHaveLength(items.length - 1);
});

test("a track section left with nothing usable is a broken contract, not an empty playlist", async () => {
  const data = JSON.parse(await loadServerData());
  for (const item of data.data[0].data.sections[1].items) {
    item.contentDescriptor.url = "javascript:alert(1)";
  }

  expect(() =>
    parsePlaylistPage(pageHtml(JSON.stringify(data)), PLAYLIST_ID),
  ).toThrow(PlaylistPageError);
});

test("fetchPlaylistPage refuses a target off the storefront host before fetching", async () => {
  let called = false;
  const recording = (async () => {
    called = true;
    return new Response("");
  }) as typeof fetch;

  await expect(
    fetchPlaylistPage(PLAYLIST_ID, "https://evil.test/playlist", {
      fetch: recording,
    }),
  ).rejects.toMatchObject({ name: "PlaylistPageError", kind: "refused" });
  expect(called).toBe(false);
});
