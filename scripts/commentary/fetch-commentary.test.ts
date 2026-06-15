import { expect, test } from "vitest";

import { commentaryKey } from "../../src/lib/commentary-store";

import { fetchCommentaryStore } from "./fetch-commentary";

const URL = "https://blob/commentary/v1/commentary.json";

function validStore() {
  return {
    [commentaryKey("en", "Artist", "Song")]: {
      lead: "A blurb about the song.",
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

test("returns null on schema mismatch", async () => {
  const result = await fetchCommentaryStore(
    URL,
    fakeFetch({ body: JSON.stringify({ "en:a|b": { lead: "" } }) }),
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
