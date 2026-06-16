import { expect, test } from "vitest";

import { commentaryKey } from "../../src/lib/commentary-store";

import { prepublishCheck } from "./prepublish";

const KEY = commentaryKey("en", "Artist A", "Song A");

function validEntry() {
  return {
    lead: "A clean blurb about the song.",
    tag: "new entry",
    sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };
}

test("accepts a valid, lyric-free store", () => {
  const store = { [KEY]: validEntry() };

  const result = prepublishCheck(store);

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.store).toEqual(store);
});

test("blocks a schema-invalid entry", () => {
  const store = { [KEY]: { ...validEntry(), sources: [] } };

  const result = prepublishCheck(store);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.startsWith("schema"))).toBe(true);
  }
});

test("blocks an entry that trips the no-lyric lint", () => {
  const store = {
    [KEY]: {
      ...validEntry(),
      detail: 'It repeats "na na na la la oh oh my my my" in the hook.',
    },
  };

  const result = prepublishCheck(store);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.startsWith("no-lyric"))).toBe(true);
  }
});

test("blocks an entry sourced from a denylisted domain", () => {
  const store = {
    [KEY]: {
      ...validEntry(),
      sources: ["https://www.billboard.com/a", "https://www.azlyrics.com/b"],
    },
  };

  const result = prepublishCheck(store);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.startsWith("source-authority"))).toBe(
      true,
    );
  }
});

test("blocks an entry with too few sources", () => {
  const store = {
    [KEY]: { ...validEntry(), sources: ["https://www.billboard.com/a"] },
  };

  const result = prepublishCheck(store);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.some((e) => e.startsWith("source-authority"))).toBe(
      true,
    );
  }
});
