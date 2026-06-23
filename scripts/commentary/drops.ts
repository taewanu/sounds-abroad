import { z } from "zod";

import type { DropRecord } from "./route";

/**
 * The drop ledger: how many times each track's draft has failed the publish gate,
 * kept beside the commentary store but deliberately separate from it. The crawl
 * bakes every commentary entry into the served charts (ADR-0007), so a tombstone
 * can never live in commentary.json; it lives here, read only by the drafting
 * worklist to stop re-drafting a track that keeps dropping (ADR-0009, #139).
 */

/**
 * Re-attempts allowed before a dropped key falls off the worklist. One initial
 * draft plus one retry: a transient research or grounding miss gets a second
 * chance, while a track that fails the gate deterministically tombstones fast.
 */
export const DEFAULT_MAX_ATTEMPTS = 2;

export const DROPS_PATHNAME = "commentary/v1/drops.json";

export const DropAttemptSchema = z.object({
  attempts: z.number().int().positive(),
  reasons: z.array(z.string()),
  lastTriedAt: z.string(),
});

export const DropsStoreSchema = z.record(z.string(), DropAttemptSchema);

export type DropAttempt = z.infer<typeof DropAttemptSchema>;
export type DropsStore = z.infer<typeof DropsStoreSchema>;

/**
 * Folds one batch's gate outcomes into the drop ledger: a dropped key's attempt
 * count rises (and tombstones once it reaches the budget), while a published key
 * clears from the ledger because a later re-draft finally passed. Pure, so the
 * retry policy is tested without touching the blob.
 */
export function recordAttempts(
  prior: DropsStore,
  dropped: DropRecord[],
  publishedKeys: readonly string[],
  triedAt: string,
): DropsStore {
  const next: DropsStore = { ...prior };
  for (const key of publishedKeys) {
    delete next[key];
  }
  for (const { key, reasons } of dropped) {
    next[key] = {
      attempts: (prior[key]?.attempts ?? 0) + 1,
      reasons,
      lastTriedAt: triedAt,
    };
  }
  return next;
}

/**
 * Derives the drop-ledger URL from the published commentary URL: both files live
 * under the same blob prefix, so the ledger needs no env var of its own.
 */
export function dropsUrlFrom(commentaryUrl: string): string {
  return commentaryUrl.replace(/commentary\.json(\?.*)?$/, "drops.json");
}
