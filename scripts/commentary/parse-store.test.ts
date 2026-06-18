import { expect, test } from "vitest";

import { commentaryKey } from "../../src/lib/commentary-store";

import { parseCandidateStore } from "./parse-store";

const KEY = commentaryKey("en", "Artist A", "Song A");

function validEntry() {
  return {
    lead: "A clean blurb about the song.",
    tag: "new entry",
    claim: "why-charting",
    sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };
}

test("accepts a schema-valid store", () => {
  const store = { [KEY]: validEntry() };

  const result = parseCandidateStore(store);

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.store).toEqual(store);
});

test("rejects a schema-invalid entry", () => {
  const store = { [KEY]: { ...validEntry(), sources: [] } };

  const result = parseCandidateStore(store);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.startsWith("schema"))).toBe(true);
  }
});
