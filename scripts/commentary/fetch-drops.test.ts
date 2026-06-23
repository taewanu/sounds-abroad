import { expect, test } from "vitest";

import { fetchDrops } from "./fetch-drops";

const URL = "https://blob/commentary/v1/drops.json";

function validLedger() {
  return {
    "en:artist|song": {
      attempts: 1,
      reasons: ["tier-consistency"],
      lastTriedAt: "2026-06-23T00:00:00.000Z",
    },
  };
}

function fakeFetch(response: { status: number; body: string }): typeof fetch {
  return (async () =>
    new Response(response.body, { status: response.status })) as typeof fetch;
}

test("returns the parsed ledger on a valid response", async () => {
  const ledger = validLedger();

  const result = await fetchDrops(
    URL,
    fakeFetch({ status: 200, body: JSON.stringify(ledger) }),
  );

  expect(result).toEqual(ledger);
});

test("returns an empty ledger on a 404 (never written yet)", async () => {
  const result = await fetchDrops(
    URL,
    fakeFetch({ status: 404, body: "Not Found" }),
  );

  expect(result).toEqual({});
});

test("throws on a non-404 failure rather than erasing the ledger", async () => {
  await expect(
    fetchDrops(URL, fakeFetch({ status: 500, body: "Server Error" })),
  ).rejects.toThrow(/read failed \(500\)/);
});

test("throws on a schema mismatch rather than overwriting from a bad read", async () => {
  await expect(
    fetchDrops(
      URL,
      fakeFetch({ status: 200, body: JSON.stringify({ "en:a|b": {} }) }),
    ),
  ).rejects.toThrow(/schema validation/);
});
