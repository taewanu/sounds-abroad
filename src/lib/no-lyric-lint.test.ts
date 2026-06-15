import { expect, test } from "vitest";

import { findLyricRisks, lintCommentary } from "./no-lyric-lint";

// Test strings are deliberately nonsense in a lyric SHAPE (quoted runs, short
// enjambed lines, repeats); they reproduce no real song.

test("findLyricRisks flags a quoted run longer than a short phrase", () => {
  const text =
    'The hook leans on "na na na la la oh oh my my my" all the way through.';

  expect(findLyricRisks(text).some((r) => r.rule === "quoted-span")).toBe(true);
});

test("findLyricRisks flags a quoted run inside typographic quotes", () => {
  const open = "“";
  const close = "”";
  const text = `It returns to ${open}na na na la la oh oh my my my${close} each chorus.`;

  expect(findLyricRisks(text).some((r) => r.rule === "quoted-span")).toBe(true);
});

test("findLyricRisks leaves a short quoted title alone", () => {
  const text = 'The single is called "Midnight Drive" on the record.';

  expect(findLyricRisks(text)).toEqual([]);
});

test("findLyricRisks does not pair apostrophes into a quoted span", () => {
  const text = "The duo's debut, the artist's biggest week, can't-miss energy.";

  expect(findLyricRisks(text)).toEqual([]);
});

test("findLyricRisks flags several short unpunctuated lines as verse", () => {
  const text = "na na na oh\nla la my my\noh oh na na\nla la my my";

  expect(findLyricRisks(text).some((r) => r.rule === "verse-lines")).toBe(true);
});

test("findLyricRisks leaves terse punctuated prose lines alone", () => {
  const text = "A new entry.\nClimbing on strong streaming.\nFirst week out.";

  expect(findLyricRisks(text)).toEqual([]);
});

test("findLyricRisks flags a repeated line", () => {
  const text =
    "This is the summer breakout here.\nIt owns radio play.\nThis is the summer breakout here.";

  expect(findLyricRisks(text).some((r) => r.rule === "repeated-line")).toBe(
    true,
  );
});

test("lintCommentary scans lead, detail, and tag", () => {
  const entry = {
    lead: 'It opens on "na na na la la oh oh my my my" before the verse.',
    sources: ["https://example.com/a"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(lintCommentary(entry).length).toBeGreaterThan(0);
});

test("lintCommentary passes clean prose commentary", () => {
  const entry = {
    lead: "A summer single riding a viral dance clip to the top.",
    detail:
      "The duo's first charting entry; momentum built over three weeks of streaming growth.",
    tag: "new entry",
    sources: ["https://example.com/a", "https://example.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(lintCommentary(entry)).toEqual([]);
});
