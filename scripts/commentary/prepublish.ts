import {
  CommentaryStoreSchema,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import { lintCommentary } from "../../src/lib/no-lyric-lint";
import { findSourceViolations } from "../../src/lib/source-authority";

/**
 * The publish gate: a candidate store must parse to the schema, clear the
 * no-lyric lint, AND clear the source-authority guard before it can go live.
 * Any failure hard-blocks the upload (ADR-0007; the source-authority guard is
 * an ADR-0008 addition that makes code the primary gate). Pure, so the gate is
 * tested without touching the blob store.
 */
export type PrepublishResult =
  | { ok: true; store: CommentaryStore }
  | { ok: false; errors: string[] };

export function prepublishCheck(raw: unknown): PrepublishResult {
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

  const errors: string[] = [];
  for (const [key, entry] of Object.entries(parsed.data)) {
    for (const risk of lintCommentary(entry)) {
      errors.push(`no-lyric (${risk.rule}) in "${key}": ${risk.excerpt}`);
    }
    for (const violation of findSourceViolations(entry)) {
      errors.push(
        `source-authority (${violation.rule}) in "${key}": ${violation.source}`,
      );
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, store: parsed.data };
}
