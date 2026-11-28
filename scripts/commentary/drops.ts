import { z } from 'zod';

import type { DropRecord } from './route';

/**
 * The drop ledger: how many times each track's draft has failed the publish gate,
 * and when the drafter last found no source stating why it is moving now, kept
 * beside the commentary store but deliberately separate from it. The crawl
 * bakes every commentary entry into the served charts (ADR-0007), so a record
 * of a try can never live in commentary.json; it lives here. The drafting
 * worklist reads it to stop re-drafting a track that keeps dropping (ADR-0009,
 * #139); the no-stated-cause time is for its wait (ADR-0026), not yet read.
 */

/**
 * Re-attempts allowed before a dropped key falls off the worklist. One initial
 * draft plus one retry: a transient research or grounding miss gets a second
 * chance, while a track that fails the gate deterministically tombstones fast.
 */
export const DEFAULT_MAX_ATTEMPTS = 2;

export const DROPS_PATHNAME = 'commentary/v1/drops.json';

export const DropAttemptSchema = z.object({
  /** Gate drops so far; 0 for a key whose only record is a no-stated-cause result. */
  attempts: z.number().int().nonnegative(),
  /** Why the latest gate drop failed; empty until the key's first one. */
  reasons: z.array(z.string()),
  /** When the latest gate drop happened; absent until the key's first one. */
  lastTriedAt: z.string().optional(),
  /**
   * When the drafter last found no source stating why the track is moving now,
   * as an ISO timestamp. It never counts toward `attempts`, because press can
   * state a cause after a song starts moving (ADR-0026).
   */
  noStatedCauseAt: z.string().optional(),
});

export const DropsStoreSchema = z.record(z.string(), DropAttemptSchema);

export type DropAttempt = z.infer<typeof DropAttemptSchema>;
export type DropsStore = z.infer<typeof DropsStoreSchema>;

/** What one batch did to each key it drafted. */
export interface BatchOutcomes {
  dropped: DropRecord[];
  publishedKeys: readonly string[];
  noStatedCauseKeys: readonly string[];
}

/**
 * Folds one batch's outcomes into the drop ledger. A dropped key's attempt count
 * rises (and tombstones once it reaches the budget); a no-stated-cause key gets
 * the batch's time and keeps its count; a published key clears from the ledger
 * because a draft finally passed. Each update keeps the key's other fields, so a
 * gate drop keeps a stored no-stated-cause time and the reverse. Pure, so the
 * retry policy is tested without touching the store.
 */
export function recordOutcomes(
  prior: DropsStore,
  { dropped, publishedKeys, noStatedCauseKeys }: BatchOutcomes,
  triedAt: string,
): DropsStore {
  const next: DropsStore = { ...prior };
  for (const key of publishedKeys) {
    delete next[key];
  }
  for (const { key, reasons } of dropped) {
    next[key] = {
      ...prior[key],
      attempts: (prior[key]?.attempts ?? 0) + 1,
      reasons,
      lastTriedAt: triedAt,
    };
  }
  for (const key of noStatedCauseKeys) {
    next[key] = { ...(prior[key] ?? { attempts: 0, reasons: [] }), noStatedCauseAt: triedAt };
  }
  return next;
}
