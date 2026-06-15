import { expect, test } from "vitest";

import {
  CommentaryStoreSchema,
  commentaryForTrack,
  commentaryKey,
  normalizeForKey,
} from "./commentary-store";

test("normalizeForKey folds case, surrounding and repeated whitespace", () => {
  expect(normalizeForKey("  The   BAND  ")).toBe("the band");
});

test("normalizeForKey folds Unicode composition so accents key the same", () => {
  const name = "Beyonc" + String.fromCharCode(0xe9); // ...e-acute
  const composed = name.normalize("NFC");
  const decomposed = name.normalize("NFD");

  expect(composed).not.toBe(decomposed);
  expect(normalizeForKey(composed)).toBe(normalizeForKey(decomposed));
});

test("commentaryKey joins language, artist, and title", () => {
  expect(commentaryKey("en", "The Band", "Hit Song")).toBe(
    "en:the band|hit song",
  );
});

test("commentaryKey is stable across cosmetic differences in artist and title", () => {
  expect(commentaryKey("en", "  the band ", "HIT  song")).toBe(
    commentaryKey("en", "The Band", "Hit Song"),
  );
});

test("commentaryKey separates languages", () => {
  expect(commentaryKey("en", "Artist", "Song")).not.toBe(
    commentaryKey("es", "Artist", "Song"),
  );
});

test("commentaryForTrack returns the stored blurb on a key match", () => {
  const entry = {
    lead: "A blurb.",
    tag: "new entry",
    sources: ["https://example.com/a"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };
  const store = { [commentaryKey("en", "Artist", "Song")]: entry };

  expect(commentaryForTrack(store, "en", "Artist", "Song")).toEqual(entry);
});

test("commentaryForTrack returns null when no blurb is on file", () => {
  expect(commentaryForTrack({}, "en", "Artist", "Song")).toBeNull();
});

test("CommentaryStoreSchema accepts an empty store", () => {
  expect(CommentaryStoreSchema.parse({})).toEqual({});
});

test("CommentaryStoreSchema rejects an entry that is not valid commentary", () => {
  const bad = { "en:artist|song": { lead: "No sources or timestamp." } };

  expect(() => CommentaryStoreSchema.parse(bad)).toThrow();
});
