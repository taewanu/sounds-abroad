import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import {
  batchIds,
  ItunesLookupError,
  LOOKUP_BATCH_MAX,
  lookupTracks,
} from "./itunes-lookup";

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

function trackRecord(id: number): { trackId: number; previewUrl: string } {
  return { trackId: id, previewUrl: `https://preview/${id}.m4a` };
}

function responseBody(records: unknown[]): string {
  return JSON.stringify({ resultCount: records.length, results: records });
}

test("resolves previewUrl from the captured kr fixture", async () => {
  const body = await loadFixture();
  const raw = JSON.parse(body).results[0];
  const id = String(raw.trackId);

  const resolved = await lookupTracks([id], "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(resolved.get(id)).toEqual({ id, previewUrl: raw.previewUrl });
});

test("sends every requested id in one comma-separated request", async () => {
  const ids = ["11", "22", "33"];
  const seen: string[] = [];
  const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    seen.push(typeof input === "string" ? input : input.toString());
    return new Response(
      responseBody(ids.map((id) => trackRecord(Number(id)))),
      {
        status: 200,
      },
    );
  }) as typeof fetch;

  await lookupTracks(ids, "kr", { fetch: spyFetch });

  expect(seen).toHaveLength(1);
  const url = new URL(seen[0]);
  expect(url.origin + url.pathname).toBe("https://itunes.apple.com/lookup");
  expect(url.searchParams.get("id")).toBe(ids.join(","));
  expect(url.searchParams.get("country")).toBe("kr");
  expect(url.searchParams.get("entity")).toBe("song");
});

test("keys every returned track by its id", async () => {
  const ids = ["11", "22", "33"];
  const body = responseBody(ids.map((id) => trackRecord(Number(id))));

  const resolved = await lookupTracks(ids, "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect([...resolved.keys()]).toEqual(ids);
});

test("omits an id the response leaves out, keeping its batch-mates", async () => {
  const ids = ["11", "22", "33"];
  const body = responseBody([trackRecord(11), trackRecord(33)]);

  const resolved = await lookupTracks(ids, "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(resolved.has("22")).toBe(false);
  expect([...resolved.keys()]).toEqual(["11", "33"]);
});

test("omits a record missing a preview, keeping its batch-mates", async () => {
  const ids = ["11", "22"];
  const body = responseBody([{ trackId: 11 }, trackRecord(22)]);

  const resolved = await lookupTracks(ids, "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(resolved.has("11")).toBe(false);
  expect(resolved.has("22")).toBe(true);
});

test("omits a track the request never asked for", async () => {
  const body = responseBody([trackRecord(999)]);

  const resolved = await lookupTracks(["11"], "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(resolved.size).toBe(0);
});

test("returns an empty map when the response holds no results", async () => {
  const body = responseBody([]);

  const resolved = await lookupTracks(["999"], "kr", {
    fetch: fakeFetch({ ok: true, body }),
  });

  expect(resolved.size).toBe(0);
});

test("makes no request for an empty id set", async () => {
  const seen: string[] = [];
  const spyFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(responseBody([]), { status: 200 });
  }) as typeof fetch;

  const resolved = await lookupTracks([], "kr", { fetch: spyFetch });

  expect(resolved.size).toBe(0);
  expect(seen).toHaveLength(0);
});

test("throws http on non-OK status", async () => {
  await expect(
    lookupTracks(["1"], "kr", {
      fetch: fakeFetch({ ok: false, status: 503, body: "" }),
    }),
  ).rejects.toMatchObject({ name: "ItunesLookupError", kind: "http" });
});

test("throws json on invalid JSON", async () => {
  await expect(
    lookupTracks(["1"], "kr", {
      fetch: fakeFetch({ ok: true, body: "not json" }),
    }),
  ).rejects.toMatchObject({ name: "ItunesLookupError", kind: "json" });
});

test("throws shape when the envelope is unexpected", async () => {
  await expect(
    lookupTracks(["1"], "kr", {
      fetch: fakeFetch({ ok: true, body: JSON.stringify({ results: "no" }) }),
    }),
  ).rejects.toMatchObject({ name: "ItunesLookupError", kind: "shape" });
});

test("throws network when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("boom");
  }) as typeof fetch;

  await expect(
    lookupTracks(["1"], "kr", { fetch: failingFetch }),
  ).rejects.toMatchObject({ name: "ItunesLookupError", kind: "network" });
});

test("carries every requested id on the thrown error", async () => {
  const ids = ["11", "22"];

  await expect(
    lookupTracks(ids, "kr", {
      fetch: fakeFetch({ ok: false, status: 503, body: "" }),
    }),
  ).rejects.toMatchObject({ ids, cc: "kr" });
});

test("is an instance of ItunesLookupError on errors", async () => {
  await expect(
    lookupTracks(["1"], "kr", {
      fetch: fakeFetch({ ok: false, status: 503, body: "" }),
    }),
  ).rejects.toBeInstanceOf(ItunesLookupError);
});

test("rejects a set larger than one request can carry", async () => {
  const ids = Array.from({ length: LOOKUP_BATCH_MAX + 1 }, (_, i) => String(i));

  await expect(lookupTracks(ids, "kr")).rejects.toBeInstanceOf(RangeError);
});

test("batchIds splits into request-sized groups, preserving order", () => {
  const ids = ["1", "2", "3", "4", "5"];

  expect(batchIds(ids, 2)).toEqual([["1", "2"], ["3", "4"], ["5"]]);
});

test("batchIds returns one group when the set fits a single request", () => {
  const ids = Array.from({ length: LOOKUP_BATCH_MAX }, (_, i) => String(i));

  expect(batchIds(ids)).toEqual([ids]);
});

test("batchIds returns nothing for an empty set", () => {
  expect(batchIds([])).toEqual([]);
});
