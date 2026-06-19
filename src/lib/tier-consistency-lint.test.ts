import { expect, test } from "vitest";

import { findTierSignals, lintTierConsistency } from "./tier-consistency-lint";

test("findTierSignals flags causal language", () => {
  const text = "It charted because of a sync placement.";

  expect(findTierSignals(text).some((v) => v.rule === "causal-language")).toBe(
    true,
  );
});

test("findTierSignals flags a multi-word causal marker", () => {
  const text = "Its rise came thanks to a late-night performance.";

  expect(findTierSignals(text).some((v) => v.rule === "causal-language")).toBe(
    true,
  );
});

test("findTierSignals flags temporal/virality language", () => {
  const text = "The track surged across short-form video this week.";

  expect(
    findTierSignals(text).some((v) => v.rule === "temporal-language"),
  ).toBe(true);
});

test("findTierSignals does not match a marker inside another word", () => {
  const text = "A reflective ballad written thereafter the tour.";

  expect(findTierSignals(text)).toEqual([]);
});

test("findTierSignals leaves a stable descriptive note alone", () => {
  const text = "A mid-tempo ballad about a long-distance friendship.";

  expect(findTierSignals(text)).toEqual([]);
});

test("findTierSignals leaves a stable 'following' as album sequence alone", () => {
  const text = "Their first full-length in two years, following 2024's album.";

  expect(findTierSignals(text)).toEqual([]);
});

test("findTierSignals leaves a bare 'after' in stable prose alone", () => {
  const text = "A ballad named after the singer's hometown.";

  expect(findTierSignals(text)).toEqual([]);
});

test("findTierSignals leaves a descriptive 'debut album' alone", () => {
  const text = "The lead track from their debut album.";

  expect(findTierSignals(text)).toEqual([]);
});

test("findTierSignals flags a charting 'debuted at'", () => {
  const text = "It debuted at number one on the singles chart.";

  expect(
    findTierSignals(text).some((v) => v.rule === "temporal-language"),
  ).toBe(true);
});

test("lintTierConsistency flags a what-it-is entry carrying causal language", () => {
  const entry = {
    lead: "The duo's breakthrough single.",
    detail: "It climbed because of a viral dance challenge.",
    tag: "breakthrough",
    claim: "what-it-is" as const,
    sources: ["https://example.com/a", "https://example.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(
    lintTierConsistency(entry).some((v) => v.rule === "causal-language"),
  ).toBe(true);
});

test("lintTierConsistency flags a what-it-is entry carrying temporal language", () => {
  const entry = {
    lead: "A single from the quartet.",
    detail: "It surged up the chart in its first days out.",
    tag: "introduction",
    claim: "what-it-is" as const,
    sources: ["https://example.com/a", "https://example.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(
    lintTierConsistency(entry).some((v) => v.rule === "temporal-language"),
  ).toBe(true);
});

test("lintTierConsistency passes a clean what-it-is entry", () => {
  const entry = {
    lead: "A mid-tempo ballad about a long-distance friendship.",
    detail: "The artist's third studio single, sung in two languages.",
    tag: "ballad",
    claim: "what-it-is" as const,
    sources: ["https://example.com/a", "https://example.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(lintTierConsistency(entry)).toEqual([]);
});

test("lintTierConsistency never flags a why-charting entry carrying the same language", () => {
  const entry = {
    lead: "Surging this week after a viral clip.",
    detail: "It exploded because of a dance challenge and jumped 40 spots.",
    tag: "trending",
    claim: "why-charting" as const,
    sources: ["https://example.com/a", "https://example.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
  };

  expect(lintTierConsistency(entry)).toEqual([]);
});
