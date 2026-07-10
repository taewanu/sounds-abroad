import { expect, test, vi } from "vitest";

import {
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";

import {
  fetchCommentaryStore,
  fetchCommentaryStoreRaw,
  withCommentaryDegradationSignal,
} from "./fetch-commentary";

const URL = "https://blob/commentary/v1/commentary.json";

function validStore(): CommentaryStore {
  return {
    [commentaryKey("en", "Artist", "Song")]: {
      lead: "A blurb about the song.",
      tag: "new entry",
      claim: "why-charting",
      sources: ["https://example.com/a"],
      generatedAt: "2026-05-16T00:00:00.000Z",
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

test("returns the parsed store on a valid response", async () => {
  const store = validStore();

  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify(store) }),
  );

  expect(result).toEqual(store);
});

test("returns null on a non-OK response", async () => {
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ ok: false, status: 404, body: "Not Found" }),
  );

  expect(result).toBeNull();
});

test("returns null on invalid JSON", async () => {
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: "<html>nope</html>" }),
  );

  expect(result).toBeNull();
});

test("keeps valid entries when another entry fails the schema", async () => {
  // One entry a since-tightened schema rejects must cost only itself: the
  // bake is authoritative, so voiding the whole store would clear every
  // freshly-crawled card.
  const store = validStore();
  const mixed = { ...store, "en:a|b": { lead: "" } };

  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify(mixed) }),
  );

  expect(result).toEqual(store);
});

test("returns null when no entry survives validation", async () => {
  // Total loss on a non-empty store reads as schema drift, not content:
  // skipping the bake beats baking an empty store over every card.
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify({ "en:a|b": { lead: "" } }) }),
  );

  expect(result).toBeNull();
});

test("returns an empty store as-is, distinct from total validation loss", async () => {
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify({}) }),
  );

  expect(result).toEqual({});
});

test("returns null on a payload that is not an object", async () => {
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify([validStore()]) }),
  );

  expect(result).toBeNull();
});

test("returns null when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("network down");
  }) as typeof fetch;

  const result = await fetchCommentaryStore(URL, failingFetch);

  expect(result).toBeNull();
});

test("fetchCommentaryStoreRaw keeps an entry the schema would reject", async () => {
  // The baking read drops this entry (see "no entry survives"); the raw read
  // preserves it verbatim so a merge-then-overwrite cannot erase it.
  const body = JSON.stringify({ "en:a|b": { lead: "" } });

  const store = await fetchCommentaryStoreRaw(URL, fakeFetch({ body }));

  expect(Object.keys(store)).toEqual(["en:a|b"]);
});

test("fetchCommentaryStoreRaw throws on a failed read rather than returning empty", async () => {
  await expect(
    fetchCommentaryStoreRaw(
      URL,
      fakeFetch({ ok: false, status: 500, body: "" }),
    ),
  ).rejects.toThrow();
});

test("fetchCommentaryStoreRaw throws on a non-object payload rather than merging it", async () => {
  await expect(
    fetchCommentaryStoreRaw(URL, fakeFetch({ body: JSON.stringify([]) })),
  ).rejects.toThrow();
});

test("withCommentaryDegradationSignal fires on a null read and passes the null through", async () => {
  const onUnavailable = vi.fn();
  const wrapped = withCommentaryDegradationSignal(
    async () => null,
    onUnavailable,
  );

  const result = await wrapped();

  expect(result).toBeNull();
  expect(onUnavailable).toHaveBeenCalledTimes(1);
});

test("withCommentaryDegradationSignal stays silent on an empty store", async () => {
  const onUnavailable = vi.fn();
  const wrapped = withCommentaryDegradationSignal(
    async () => ({}),
    onUnavailable,
  );

  const result = await wrapped();

  expect(result).toEqual({});
  expect(onUnavailable).not.toHaveBeenCalled();
});

test("withCommentaryDegradationSignal passes a loaded store through untouched", async () => {
  const store = validStore();
  const onUnavailable = vi.fn();
  const wrapped = withCommentaryDegradationSignal(
    async () => store,
    onUnavailable,
  );

  const result = await wrapped();

  expect(result).toBe(store);
  expect(onUnavailable).not.toHaveBeenCalled();
});
