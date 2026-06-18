import { expect, test } from "vitest";

import type { Commentary } from "../../src/lib/chart-schema";
import type { GroundingClient } from "../../src/lib/grounding";

import {
  combineSourceTexts,
  groundEntry,
  type GroundEntryDeps,
} from "./ground";

// The real fetch and the claude -p subprocess stay out of these tests (the
// injectable shell exists so they can); the pure verdict logic and the
// fail-closed orchestration are exercised with injected dependencies.

function entry(claim: Commentary["claim"], sources: string[]): Commentary {
  return {
    lead: "A lead claim.",
    tag: "new",
    claim,
    sources,
    generatedAt: "2026-06-18T00:00:00.000Z",
  };
}

const groundedJudge: GroundingClient = async () => ({
  status: "grounded",
  reason: "The source states the claim.",
});

test("combineSourceTexts joins every loaded source for the judge", () => {
  const result = combineSourceTexts(["first body", "second body"]);

  expect(result).toEqual({ ok: true, sourceText: "first body\n\nsecond body" });
});

test("combineSourceTexts judges the sources that loaded on a partial failure", () => {
  const result = combineSourceTexts(["live body", null]);

  expect(result).toEqual({ ok: true, sourceText: "live body" });
});

test("combineSourceTexts drops the card when every source is unreachable", () => {
  const result = combineSourceTexts([null, null]);

  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.verdict.grounded).toBe(false);
});

test("groundEntry grounds a why-charting entry the same way as what-it-is", async () => {
  const deps: GroundEntryDeps = {
    fetchSourceText: async () => "source body",
    judge: groundedJudge,
  };

  const verdict = await groundEntry(
    entry("why-charting", ["https://example.com/1", "https://example.com/2"]),
    deps,
  );

  expect(verdict.grounded).toBe(true);
});

test("groundEntry drops the card when every source is unreachable", async () => {
  const deps: GroundEntryDeps = {
    fetchSourceText: async () => null,
    judge: groundedJudge,
  };

  const verdict = await groundEntry(
    entry("what-it-is", ["https://example.com/1"]),
    deps,
  );

  expect(verdict.grounded).toBe(false);
});

test("groundEntry fails closed when a source fetch throws", async () => {
  const deps: GroundEntryDeps = {
    fetchSourceText: async () => {
      throw new Error("network down");
    },
    judge: groundedJudge,
  };

  const verdict = await groundEntry(
    entry("what-it-is", ["https://example.com/1"]),
    deps,
  );

  expect(verdict.grounded).toBe(false);
});

test("groundEntry fails closed when the judge throws", async () => {
  const deps: GroundEntryDeps = {
    fetchSourceText: async () => "source body",
    judge: async () => {
      throw new Error("judge down");
    },
  };

  const verdict = await groundEntry(
    entry("what-it-is", ["https://example.com/1"]),
    deps,
  );

  expect(verdict.grounded).toBe(false);
});
