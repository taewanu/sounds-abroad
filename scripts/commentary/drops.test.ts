import { expect, test } from 'vitest';

import { DropAttemptSchema, recordOutcomes, type BatchOutcomes, type DropsStore } from './drops';

const TRIED = '2026-06-23T04:00:00.000Z';

function outcomes(overrides: Partial<BatchOutcomes> = {}): BatchOutcomes {
  return { dropped: [], publishedKeys: [], noStatedCauseKeys: [], ...overrides };
}

test('recordOutcomes logs a first-time drop at one attempt', () => {
  const next = recordOutcomes(
    {},
    outcomes({ dropped: [{ key: 'en:a|x', reasons: ['tier-consistency'] }] }),
    TRIED,
  );

  expect(next['en:a|x']).toEqual({
    attempts: 1,
    reasons: ['tier-consistency'],
    lastTriedAt: TRIED,
  });
});

test('recordOutcomes increments a repeat drop toward the budget', () => {
  const prior: DropsStore = {
    'en:a|x': {
      attempts: 1,
      reasons: ['source-authority'],
      lastTriedAt: 'old',
    },
  };

  const next = recordOutcomes(
    prior,
    outcomes({ dropped: [{ key: 'en:a|x', reasons: ['tier-consistency'] }] }),
    TRIED,
  );

  expect(next['en:a|x']).toEqual({
    attempts: 2,
    reasons: ['tier-consistency'],
    lastTriedAt: TRIED,
  });
});

test('recordOutcomes clears a key that finally published', () => {
  const prior: DropsStore = {
    'en:a|x': { attempts: 1, reasons: ['grounding: thin'], lastTriedAt: 'old' },
  };

  const next = recordOutcomes(prior, outcomes({ publishedKeys: ['en:a|x'] }), TRIED);

  expect(next).not.toHaveProperty('en:a|x');
});

test('recordOutcomes leaves a key untouched this batch as it was', () => {
  const prior: DropsStore = {
    'en:b|y': { attempts: 2, reasons: ['no-lyric'], lastTriedAt: 'old' },
  };

  const next = recordOutcomes(
    prior,
    outcomes({ dropped: [{ key: 'en:a|x', reasons: ['tier-consistency'] }] }),
    TRIED,
  );

  expect(next['en:b|y']).toEqual(prior['en:b|y']);
});

test('recordOutcomes does not mutate the prior ledger', () => {
  const prior: DropsStore = {
    'en:a|x': {
      attempts: 1,
      reasons: ['source-authority'],
      lastTriedAt: 'old',
    },
  };

  recordOutcomes(
    prior,
    outcomes({ dropped: [{ key: 'en:a|x', reasons: ['tier-consistency'] }] }),
    TRIED,
  );

  expect(prior['en:a|x'].attempts).toBe(1);
});

test('recordOutcomes records a first no-stated-cause result with its time and no attempts', () => {
  const next = recordOutcomes({}, outcomes({ noStatedCauseKeys: ['en:a|x'] }), TRIED);

  expect(next['en:a|x']).toEqual({ attempts: 0, reasons: [], noStatedCauseAt: TRIED });
});

test('recordOutcomes keeps the attempt count of a key that later has no stated cause', () => {
  const prior: DropsStore = {
    'en:a|x': { attempts: 1, reasons: ['source-authority'], lastTriedAt: 'old' },
  };

  const next = recordOutcomes(prior, outcomes({ noStatedCauseKeys: ['en:a|x'] }), TRIED);

  expect(next['en:a|x']).toEqual({
    attempts: 1,
    reasons: ['source-authority'],
    lastTriedAt: 'old',
    noStatedCauseAt: TRIED,
  });
});

test('recordOutcomes keeps the stored no-stated-cause time through a later gate drop', () => {
  const prior: DropsStore = {
    'en:a|x': { attempts: 0, reasons: [], noStatedCauseAt: 'old' },
  };

  const next = recordOutcomes(
    prior,
    outcomes({ dropped: [{ key: 'en:a|x', reasons: ['source-authority'] }] }),
    TRIED,
  );

  expect(next['en:a|x']).toEqual({
    attempts: 1,
    reasons: ['source-authority'],
    lastTriedAt: TRIED,
    noStatedCauseAt: 'old',
  });
});

test('DropAttemptSchema accepts an entry with no gate attempts and a no-stated-cause time', () => {
  const entry = { attempts: 0, reasons: [], noStatedCauseAt: TRIED };

  expect(DropAttemptSchema.safeParse(entry).success).toBe(true);
});

test('DropAttemptSchema still accepts an entry written before no-stated-cause existed', () => {
  const entry = { attempts: 2, reasons: ['source-authority'], lastTriedAt: TRIED };

  expect(DropAttemptSchema.safeParse(entry).success).toBe(true);
});
