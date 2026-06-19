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

test("findSourceViolations flags an entry with no allowlisted source", () => {
  const sources = [
    "https://some-music-blog.example/post",
    "https://another-site.example/story",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(violations.some((v) => v.rule === "no-authoritative-source")).toBe(
    true,
  );
});

test("findSourceViolations accepts a non-allowlisted source alongside one allowlisted", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://some-music-blog.example/post",
  ];

  expect(findSourceViolations(entry(sources))).toEqual([]);
});

test("findSourceViolations counts an allowlisted subdomain as authoritative", () => {
  const sources = [
    "https://music.theguardian.com/article",
    "https://some-music-blog.example/post",
  ];

  expect(
    findSourceViolations(entry(sources)).some(
      (v) => v.rule === "no-authoritative-source",
    ),
  ).toBe(false);
});

test("findSourceViolations fails a chart-body-only entry with the chart-body rule", () => {
  const sources = [
    "https://www.officialcharts.com/charts/singles-chart",
    "https://some-music-blog.example/post",
  ];

  const violations = findSourceViolations(entry(sources));

  expect(
    violations.some((v) => v.rule === "chart-body-not-authoritative"),
  ).toBe(true);
  expect(violations.some((v) => v.rule === "no-authoritative-source")).toBe(
    false,
  );
});

test("findSourceViolations accepts a chart body alongside a journalism source", () => {
  const sources = [
    "https://www.billboard.com/music/a",
    "https://www.officialcharts.com/charts/singles-chart",
  ];

  expect(findSourceViolations(entry(sources))).toEqual([]);
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
