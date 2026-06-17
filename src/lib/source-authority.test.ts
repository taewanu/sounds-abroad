import { expect, test } from "vitest";

import { findSourceViolations } from "./source-authority";

function entry(sources: string[]) {
  return {
    lead: "A grounded note about the song.",
    tag: "new entry",
    claim: "why-charting" as const,
    sources,
    generatedAt: "2026-05-16T00:00:00.000Z",
  };
}

test("findSourceViolations passes two reputable sources", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://pitchfork.com/reviews/b",
  ];

  expect(findSourceViolations(entry(sources))).toEqual([]);
});

test("findSourceViolations flags a denylisted lyrics domain", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://www.azlyrics.com/lyrics/b",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "denied-source")).toBe(true);
});

test("findSourceViolations names the offending denylisted source", () => {
  const denied = "https://www.azlyrics.com/lyrics/b";
  const sources = ["https://www.billboard.com/music/a", denied];

  const violations = findSourceViolations(entry(sources));

  expect(violations).toContainEqual({ rule: "denied-source", source: denied });
});

test("findSourceViolations flags a fan-wiki subdomain on the registrable domain", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://some-artist.fandom.com/wiki/Song",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "denied-source")).toBe(true);
});

test("findSourceViolations allows Genius alongside the lyrics-site denials", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://genius.com/some-song",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "denied-source")).toBe(false);
});

test("findSourceViolations flags a single source as too few", () => {
  const sources = ["https://www.billboard.com/music/a"];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "too-few-sources")).toBe(true);
});

test("findSourceViolations ignores www and casing when matching a denied domain", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://WWW.AZLyrics.com/lyrics/b",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "denied-source")).toBe(true);
});

test("findSourceViolations reports both a denied source and too few sources", () => {
  const sources = ["https://www.azlyrics.com/lyrics/b"];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "denied-source")).toBe(true);
  expect(violations.some((v) => v.rule === "too-few-sources")).toBe(true);
});
