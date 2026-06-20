import { describe, expect, test, vi } from "vitest";

import type { Commentary } from "../../src/lib/chart-schema";
import { commentaryKey } from "../../src/lib/commentary-store";
import type { GroundingVerdict } from "../../src/lib/grounding";

import { routeStore } from "./route";

function entry(overrides: Partial<Commentary> = {}): Commentary {
  return {
    lead: "A clean blurb about the song.",
    tag: "new entry",
    claim: "why-charting",
    sources: ["https://www.billboard.com/a", "https://pitchfork.com/b"],
    generatedAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

const grounds = (): Promise<GroundingVerdict> =>
  Promise.resolve({ grounded: true, reason: "Sources state the claim." });
const doesNotGround = (): Promise<GroundingVerdict> =>
  Promise.resolve({ grounded: false, reason: "No source states it." });

const KEY = commentaryKey("en", "Artist A", "Song A");
const OTHER = commentaryKey("en", "Artist B", "Song B");

describe("routeStore", () => {
  test("publishes an entry that clears every check", async () => {
    const store = { [KEY]: entry() };

    const result = await routeStore(store, { ground: grounds });

    expect(result.published).toEqual(store);
    expect(result.dropped).toEqual([]);
  });

  test("drops a clean entry the sources do not ground", async () => {
    const store = { [KEY]: entry() };

    const result = await routeStore(store, { ground: doesNotGround });

    expect(result.published).toEqual({});
    expect(result.dropped).toEqual([
      { key: KEY, reasons: ["grounding: No source states it."] },
    ]);
  });

  test("a grounding drop always carries a reason, even when the verdict's is empty", async () => {
    const store = { [KEY]: entry() };

    const result = await routeStore(store, {
      ground: () => Promise.resolve({ grounded: false, reason: "" }),
    });

    expect(result.dropped).toEqual([
      { key: KEY, reasons: ["grounding: Grounding failed."] },
    ]);
  });

  test("drops on a deterministic failure without spending a grounding call", async () => {
    const ground = vi.fn(grounds);
    const store = {
      [KEY]: entry({
        sources: ["https://www.billboard.com/a", "https://www.azlyrics.com/b"],
      }),
    };

    const result = await routeStore(store, { ground });

    expect(result.published).toEqual({});
    expect(result.dropped).toEqual([
      { key: KEY, reasons: ["source-authority"] },
    ]);
    expect(ground).not.toHaveBeenCalled();
  });

  test("a no-lyric drop names the failing sub-rule and quotes the excerpt", async () => {
    const quoted = '"na na na la la oh oh my my my"';
    const store = {
      [KEY]: entry({ lead: `The hook repeats ${quoted} throughout.` }),
    };

    const result = await routeStore(store, { ground: grounds });

    expect(result.published).toEqual({});
    expect(result.dropped).toEqual([
      { key: KEY, reasons: [`no-lyric: quoted-span ${quoted}`] },
    ]);
  });

  test("routes each entry independently: a dropped card never blocks a clean one", async () => {
    const store = {
      [KEY]: entry(),
      [OTHER]: entry({ sources: ["https://www.billboard.com/only-one"] }),
    };

    const result = await routeStore(store, { ground: grounds });

    expect(result.published).toEqual({ [KEY]: store[KEY] });
    expect(result.dropped).toEqual([
      { key: OTHER, reasons: ["source-authority"] },
    ]);
  });
});
