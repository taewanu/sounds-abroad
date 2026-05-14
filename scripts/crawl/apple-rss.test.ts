import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppleRssError, fetchAppleRss } from "./apple-rss";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/rss-kr.json",
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

describe("fetchAppleRss", () => {
  it("parses the captured kr fixture into 25 ranked tracks", async () => {
    const body = await loadFixture();
    const raw = JSON.parse(body).feed.results[0];
    const tracks = await fetchAppleRss("kr", {
      fetch: fakeFetch({ ok: true, body }),
    });

    expect(tracks).toHaveLength(25);
    expect(tracks[0]).toEqual({
      rank: 1,
      id: raw.id,
      name: raw.name,
      artist: raw.artistName,
      appleUrl: raw.url,
      artworkUrl: raw.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg"),
    });
  });

  it("rewrites 100x100 artwork URL to 600x600", async () => {
    const body = await loadFixture();
    const tracks = await fetchAppleRss("kr", {
      fetch: fakeFetch({ ok: true, body }),
    });

    for (const t of tracks) {
      expect(t.artworkUrl).not.toContain("/100x100bb.jpg");
      expect(t.artworkUrl).toContain("/600x600bb.jpg");
    }
  });

  it("hits the canonical rss.marketingtools.apple.com endpoint", async () => {
    const body = await loadFixture();
    const seen: string[] = [];
    const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      seen.push(typeof input === "string" ? input : input.toString());
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    await fetchAppleRss("kr", { fetch: spyFetch });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(
      "https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/25/songs.json",
    );
  });

  it("throws AppleRssError on non-OK status", async () => {
    await expect(
      fetchAppleRss("kr", {
        fetch: fakeFetch({
          ok: false,
          status: 503,
          body: "Service Unavailable",
        }),
      }),
    ).rejects.toBeInstanceOf(AppleRssError);
  });

  it("throws AppleRssError on invalid JSON", async () => {
    await expect(
      fetchAppleRss("kr", {
        fetch: fakeFetch({ ok: true, body: "<html>nope</html>" }),
      }),
    ).rejects.toBeInstanceOf(AppleRssError);
  });

  it("throws AppleRssError on shape mismatch", async () => {
    await expect(
      fetchAppleRss("kr", {
        fetch: fakeFetch({
          ok: true,
          body: JSON.stringify({ feed: { results: [] } }),
        }),
      }),
    ).rejects.toBeInstanceOf(AppleRssError);
  });

  it("throws AppleRssError when fetch itself rejects", async () => {
    const failingFetch: typeof fetch = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    await expect(
      fetchAppleRss("kr", { fetch: failingFetch }),
    ).rejects.toBeInstanceOf(AppleRssError);
  });
});
