import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ItunesLookupError, lookupTrack } from "./itunes-lookup.mjs";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/lookup-kr-redred.json",
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

describe("lookupTrack", () => {
  it("resolves previewUrl from the captured kr fixture", async () => {
    const body = await loadFixture();
    const result = await lookupTrack("1887671067", "kr", {
      fetch: fakeFetch({ ok: true, body }),
    });

    expect(result.id).toBe("1887671067");
    expect(result.previewUrl).toBe(
      "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/b9/a9/23/b9a92352-f4a2-fd4e-c2de-4985bc38133c/mzaf_7598194542973128311.plus.aac.p.m4a",
    );
  });

  it("hits the canonical itunes.apple.com lookup endpoint with id+country", async () => {
    const body = await loadFixture();
    const seen: string[] = [];
    const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      seen.push(typeof input === "string" ? input : input.toString());
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    await lookupTrack("1887671067", "kr", { fetch: spyFetch });

    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.origin + url.pathname).toBe("https://itunes.apple.com/lookup");
    expect(url.searchParams.get("id")).toBe("1887671067");
    expect(url.searchParams.get("country")).toBe("kr");
    expect(url.searchParams.get("entity")).toBe("song");
  });

  it("throws miss when resultCount is 0", async () => {
    const body = JSON.stringify({ resultCount: 0, results: [] });
    await expect(
      lookupTrack("999", "kr", { fetch: fakeFetch({ ok: true, body }) }),
    ).rejects.toMatchObject({
      name: "ItunesLookupError",
      kind: "miss",
    });
  });

  it("throws http on non-OK status", async () => {
    await expect(
      lookupTrack("1", "kr", {
        fetch: fakeFetch({ ok: false, status: 503, body: "" }),
      }),
    ).rejects.toMatchObject({
      name: "ItunesLookupError",
      kind: "http",
    });
  });

  it("throws json on invalid JSON", async () => {
    await expect(
      lookupTrack("1", "kr", {
        fetch: fakeFetch({ ok: true, body: "not json" }),
      }),
    ).rejects.toMatchObject({
      name: "ItunesLookupError",
      kind: "json",
    });
  });

  it("throws shape on unexpected payload shape", async () => {
    await expect(
      lookupTrack("1", "kr", {
        fetch: fakeFetch({
          ok: true,
          body: JSON.stringify({
            resultCount: 1,
            results: [{ wrapperType: "track" }],
          }),
        }),
      }),
    ).rejects.toMatchObject({
      name: "ItunesLookupError",
      kind: "shape",
    });
  });

  it("throws network when fetch rejects", async () => {
    const failingFetch: typeof fetch = (async () => {
      throw new TypeError("boom");
    }) as typeof fetch;

    await expect(
      lookupTrack("1", "kr", { fetch: failingFetch }),
    ).rejects.toMatchObject({
      name: "ItunesLookupError",
      kind: "network",
    });
  });

  it("is an instance of ItunesLookupError on errors", async () => {
    await expect(
      lookupTrack("1", "kr", {
        fetch: fakeFetch({ ok: false, status: 503, body: "" }),
      }),
    ).rejects.toBeInstanceOf(ItunesLookupError);
  });
});
