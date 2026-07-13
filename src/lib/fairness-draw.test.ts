import { expect, test } from "vitest";

import { COUNTRIES } from "./countries";
import { addVisited, pickShuffleCountry, weightedDraw } from "./fairness-draw";

test("weightedDraw overwhelmingly prefers an unvisited country in the pool", () => {
  const [seen, unseen] = COUNTRIES;
  const pool = [seen.code, unseen.code];
  const visited = new Set([seen.code]);

  for (const r of [0.1, 0.5, 0.9]) {
    expect(weightedDraw(pool, visited, r)).toBe(unseen.code);
  }
});

test("weightedDraw flattens to a uniform draw once every pool member is visited", () => {
  const [first, second] = COUNTRIES;
  const pool = [first.code, second.code];
  const visited = new Set([first.code, second.code]);

  expect(weightedDraw(pool, visited, 0.25)).toBe(first.code);
  expect(weightedDraw(pool, visited, 0.75)).toBe(second.code);
});

test("pickShuffleCountry never returns an excluded country", () => {
  const excluded = COUNTRIES[0].code;

  // Sweep the whole draw range: none of it may land on an excluded country.
  for (let r = 0; r < 1; r += 0.02) {
    expect(pickShuffleCountry(new Set(), [excluded], () => r)).not.toBe(
      excluded,
    );
  }
});

test("pickShuffleCountry excludes every listed code, not only the first", () => {
  const excluded = COUNTRIES.slice(0, 3).map((c) => c.code);

  for (let r = 0; r < 1; r += 0.02) {
    expect(excluded).not.toContain(
      pickShuffleCountry(new Set(), excluded, () => r),
    );
  }
});

test("pickShuffleCountry draws from the whole globe, not a rest-direction cluster", () => {
  // r=0 takes the first pool member. With one country excluded that is the
  // first entry that isn't it, so the pool spans every country rather than a
  // geographic neighbourhood.
  const excluded = COUNTRIES[1].code;
  const firstOther = COUNTRIES.find((c) => c.code !== excluded)!.code;

  expect(pickShuffleCountry(new Set(), [excluded], () => 0)).toBe(firstOther);
});

test("pickShuffleCountry allows any country when nothing is excluded", () => {
  expect(pickShuffleCountry(new Set(), [], () => 0)).toBe(COUNTRIES[0].code);
});

test("pickShuffleCountry favours an unvisited country over any single visited one", () => {
  // Visit every country but one; the excluded (also visited) never enters the
  // pool. Across a uniform draw sweep the unvisited country wins far more often
  // than any single visited one, and the excluded country never appears.
  const excluded = COUNTRIES[0].code;
  const unseen = COUNTRIES[COUNTRIES.length - 1].code;
  const visited = new Set(
    COUNTRIES.filter((c) => c.code !== excluded && c.code !== unseen).map(
      (c) => c.code,
    ),
  );

  const counts = new Map<string, number>();
  for (let r = 0; r < 1; r += 0.001) {
    const code = pickShuffleCountry(visited, [excluded], () => r);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const unseenCount = counts.get(unseen) ?? 0;
  const maxVisited = Math.max(
    ...[...counts]
      .filter(([code]) => code !== unseen)
      .map(([, count]) => count),
  );
  expect(counts.has(excluded)).toBe(false);
  expect(unseenCount).toBeGreaterThan(maxVisited);
});

test("addVisited records a newly settled country in the visited set", () => {
  const result = addVisited(new Set(["us"]), "kr");

  expect([...result].sort()).toEqual(["kr", "us"]);
});

test("addVisited returns the same set when the country is already visited", () => {
  const visited = new Set(["us"]);

  expect(addVisited(visited, "us")).toBe(visited);
});
