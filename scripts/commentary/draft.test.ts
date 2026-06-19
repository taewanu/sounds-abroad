import { expect, test } from "vitest";

import type { DraftClient, RawDraft } from "../../src/lib/drafting";

import { draftEntry, toDraftInput } from "./draft";
import type { WorklistItem } from "./worklist";

// The claude -p subprocess stays out of these tests (the injectable drafter
// exists so it can); the pure mapping and the fail-closed orchestration are
// exercised with an injected client.

function item(overrides: Partial<WorklistItem> = {}): WorklistItem {
  return {
    key: "en:artist|song",
    artist: "Artist",
    name: "Song",
    bestRank: 3,
    reason: "new-entry",
    confidence: "ok",
    countries: [
      { cc: "us", rank: 3 },
      { cc: "ca", rank: 5 },
    ],
    ...overrides,
  };
}

const TS = "2026-06-19T00:00:00.000Z";

const validDrafter: DraftClient = async () => ({
  lead: "A clean blurb about the song.",
  tag: "new entry",
  claim: "why-charting",
  sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
});

test("toDraftInput maps chart positions to cc#rank tokens", () => {
  expect(toDraftInput(item()).chartedIn).toEqual(["us#3", "ca#5"]);
});

test("toDraftInput passes the artist and title through unchanged", () => {
  const input = toDraftInput(item({ artist: "aespa", name: "LEMONADE" }));

  expect(input.artist).toBe("aespa");
  expect(input.name).toBe("LEMONADE");
});

test("draftEntry stamps the supplied timestamp on a valid draft", async () => {
  const entry = await draftEntry(item(), TS, validDrafter);

  expect(entry?.generatedAt).toBe(TS);
});

test("draftEntry returns null when the drafter throws", async () => {
  const drafter: DraftClient = async () => {
    throw new Error("subprocess down");
  };

  expect(await draftEntry(item(), TS, drafter)).toBeNull();
});

test("draftEntry returns null when the draft fails the schema", async () => {
  const badDrafter: DraftClient = async () =>
    ({ lead: "", tag: "x", claim: "why-charting", sources: [] }) as RawDraft;

  expect(await draftEntry(item(), TS, badDrafter)).toBeNull();
});
