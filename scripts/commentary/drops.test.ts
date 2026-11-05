import { expect, test } from "vitest";

import { recordAttempts, type DropsStore } from "./drops";

const TRIED = "2026-06-23T04:00:00.000Z";

test("recordAttempts logs a first-time drop at one attempt", () => {
  const next = recordAttempts(
    {},
    [{ key: "en:a|x", reasons: ["tier-consistency"] }],
    [],
    TRIED,
  );

  expect(next["en:a|x"]).toEqual({
    attempts: 1,
    reasons: ["tier-consistency"],
    lastTriedAt: TRIED,
  });
});

test("recordAttempts increments a repeat drop toward the budget", () => {
  const prior: DropsStore = {
    "en:a|x": {
      attempts: 1,
      reasons: ["source-authority"],
      lastTriedAt: "old",
    },
  };

  const next = recordAttempts(
    prior,
    [{ key: "en:a|x", reasons: ["tier-consistency"] }],
    [],
    TRIED,
  );

  expect(next["en:a|x"]).toEqual({
    attempts: 2,
    reasons: ["tier-consistency"],
    lastTriedAt: TRIED,
  });
});

test("recordAttempts clears a key that finally published", () => {
  const prior: DropsStore = {
    "en:a|x": { attempts: 1, reasons: ["grounding: thin"], lastTriedAt: "old" },
  };

  const next = recordAttempts(prior, [], ["en:a|x"], TRIED);

  expect(next).not.toHaveProperty("en:a|x");
});

test("recordAttempts leaves a key untouched this batch as it was", () => {
  const prior: DropsStore = {
    "en:b|y": { attempts: 2, reasons: ["no-lyric"], lastTriedAt: "old" },
  };

  const next = recordAttempts(
    prior,
    [{ key: "en:a|x", reasons: ["tier-consistency"] }],
    [],
    TRIED,
  );

  expect(next["en:b|y"]).toEqual(prior["en:b|y"]);
});

test("recordAttempts does not mutate the prior ledger", () => {
  const prior: DropsStore = {
    "en:a|x": {
      attempts: 1,
      reasons: ["source-authority"],
      lastTriedAt: "old",
    },
  };

  recordAttempts(
    prior,
    [{ key: "en:a|x", reasons: ["tier-consistency"] }],
    [],
    TRIED,
  );

  expect(prior["en:a|x"].attempts).toBe(1);
});
