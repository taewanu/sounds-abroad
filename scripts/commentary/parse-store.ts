import {
  CommentaryStoreSchema,
  type CommentaryStore,
} from "../../src/lib/commentary-store";

/**
 * The structural precondition for publishing: a candidate file must parse to
 * the commentary-store schema before anything can route it. A malformed file is
 * a pipeline bug, not a per-card content judgment, so it hard-blocks the whole
 * upload rather than dropping cards. The content checks (no-lyric,
 * source-authority, tier-consistency, grounding) run per entry in the router,
 * which drops a failing card instead of blocking the store (ADR-0009). Pure, so
 * the parse is tested without touching the blob store.
 */
export type ParseResult =
  | { ok: true; store: CommentaryStore }
  | { ok: false; errors: string[] };

export function parseCandidateStore(raw: unknown): ParseResult {
  const parsed = CommentaryStoreSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) =>
          `schema: ${issue.path.join(".") || "(root)"} — ${issue.message}`,
      ),
    };
  }

  return { ok: true, store: parsed.data };
}
