import { expect, test } from "vitest";

import { interpretDraft, type RawDraft } from "./drafting";

const TS = "2026-06-18T00:00:00.000Z";

function rawDraft(overrides: Partial<RawDraft> = {}): RawDraft {
  return {
    lead: "A clean blurb about the song.",
    tag: "new entry",
    claim: "why-charting",
    sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
    ...overrides,
  };
}

test("interpretDraft stamps generatedAt and returns a schema-valid entry", () => {
  const entry = interpretDraft(rawDraft({ detail: "More context." }), TS);

  expect(entry).toEqual({
    lead: "A clean blurb about the song.",
    detail: "More context.",
    tag: "new entry",
    claim: "why-charting",
    sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
    generatedAt: TS,
  });
});

test("interpretDraft rejects an unknown claim tier", () => {
  expect(interpretDraft(rawDraft({ claim: "speculation" }), TS)).toBeNull();
});

test("interpretDraft rejects a non-URL source", () => {
  expect(interpretDraft(rawDraft({ sources: ["not a url"] }), TS)).toBeNull();
});

test("interpretDraft rejects an empty lead", () => {
  expect(interpretDraft(rawDraft({ lead: "" }), TS)).toBeNull();
});
