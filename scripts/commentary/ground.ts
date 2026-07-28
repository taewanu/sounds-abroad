import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Commentary } from "../../src/lib/chart-schema";
import {
  gradeGrounding,
  type GroundingClient,
  type GroundingVerdict,
} from "../../src/lib/grounding";
import {
  assertAllowedTarget,
  guardedFetch,
  RefusedTargetError,
} from "../lib/outbound-fetch";

/**
 * The grounding shell: the network-and-subprocess half of the check whose pure
 * verdict logic lives in `src/lib/grounding.ts`. It fetches a blurb's cited
 * sources, runs the `claude -p` judge, and routes the result through the seam.
 * Kept out of unit tests on purpose — it touches the network and a subprocess;
 * the tested seam holds the decision logic.
 */

const execFileAsync = promisify(execFile);

/**
 * The structured-output contract handed to `claude -p`. Forcing the tri-state
 * shape means the shell reads one validated field instead of parsing prose.
 */
const JUDGE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    status: { type: "string", enum: ["grounded", "ungrounded", "uncertain"] },
    reason: { type: "string" },
  },
  required: ["status", "reason"],
  additionalProperties: false,
});

/**
 * Fetch a cited source and reduce it to plain text for the judge. Strips markup
 * and collapses whitespace, crude on purpose, since the judge reads prose, not
 * HTML. Returns null on any failure (bad status, network error, empty body) so
 * the caller can fail closed rather than judge a claim against nothing. A
 * refused target is the exception: it throws, because a citation the guard
 * turned away is a different fact about the entry than a source that happened
 * to be down, and the caller has to be able to tell them apart.
 */
export async function fetchSourceText(
  url: string,
  fetchImpl?: typeof fetch,
): Promise<string | null> {
  try {
    const res = await (fetchImpl ? fetchImpl(url) : guardedFetch(url));
    if (!res.ok) return null;
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    if (err instanceof RefusedTargetError) throw err;
    return null;
  }
}

/**
 * A GroundingClient backed by the local Claude Code binary. `claude -p` is the
 * only sanctioned way to spend the Max subscription programmatically: the raw
 * API rejects subscription OAuth and the ToS forbids it. `--tools ''` and
 * `--setting-sources ''` strip the agentic surface to a single classification
 * turn; `--json-schema` forces the verdict into `.structured_output`.
 *
 * Fail-closed: any non-zero exit, timeout, non-JSON output, error envelope, or
 * missing structured output yields a status the seam treats as not-grounded,
 * which drops the card (ADR-0009).
 */
export function createClaudeJudge(timeoutMs = 60_000): GroundingClient {
  return async (prompt) => {
    try {
      const { stdout } = await execFileAsync(
        "claude",
        [
          "-p",
          prompt,
          "--output-format",
          "json",
          "--json-schema",
          JUDGE_SCHEMA,
          "--tools",
          "",
          "--setting-sources",
          "",
        ],
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      );
      const envelope = JSON.parse(stdout) as {
        is_error?: boolean;
        structured_output?: { status?: unknown; reason?: unknown };
      };
      const out = envelope.structured_output;
      if (envelope.is_error || !out || typeof out.status !== "string") {
        return { status: "error", reason: "Judge returned no usable verdict." };
      }
      return {
        status: out.status,
        reason: typeof out.reason === "string" ? out.reason : undefined,
      };
    } catch {
      return { status: "error", reason: "Judge invocation failed." };
    }
  };
}

/**
 * Reduce the fetched source bodies to either the text the judge should read, or
 * a not-grounded verdict that skips the judge entirely. Lenient on a partial
 * fetch failure: judge against the sources that loaded, since the STATES
 * threshold drops any claim those live sources do not support, so a claim whose
 * only support was an unreachable source is dropped anyway. Only when every
 * source is unreachable is there nothing to judge, which drops the card
 * (ADR-0009: fail-closed means no card).
 */
export function combineSourceTexts(
  texts: Array<string | null>,
): { ok: true; sourceText: string } | { ok: false; verdict: GroundingVerdict } {
  const loaded = texts.filter((t) => t !== null);

  if (loaded.length === 0) {
    return {
      ok: false,
      verdict: {
        grounded: false,
        reason: `All ${texts.length} cited source(s) failed to fetch; dropping the card.`,
      },
    };
  }

  return {
    ok: true,
    sourceText: loaded.join("\n\n"),
  };
}

function refusedVerdict(err: unknown): GroundingVerdict {
  return {
    grounded: false,
    reason: `Cited source is a refused target: ${
      err instanceof Error ? err.message : String(err)
    }`,
  };
}

export interface GroundEntryDeps {
  fetchSourceText: (url: string) => Promise<string | null>;
  judge: GroundingClient;
}

/**
 * Ground one blurb end to end: fetch its cited sources, then ask the judge
 * whether they STATE its claims. Tier-agnostic (ADR-0009): both tiers are
 * grounded the same way, and a not-grounded verdict drops the card rather than
 * routing to a person. This function is the fail-closed boundary: a throw from
 * either dependency drops only this card, never aborting the publish pass. A
 * thrown fetch is treated as an unreachable source, the same as a null, except
 * for a refusal, which drops the card.
 */
export async function groundEntry(
  entry: Commentary,
  deps: GroundEntryDeps,
): Promise<GroundingVerdict> {
  // A refused citation drops the whole entry: a blurb citing a target the
  // pipeline must not dial is suspect as a whole, so no verdict is reached on
  // its acceptable-looking neighbours either. What the URL alone reveals is
  // caught here, before any fetch; a host that only reveals itself when it
  // resolves is caught below, once the guard refuses the connection.
  for (const url of entry.sources) {
    try {
      assertAllowedTarget(url);
    } catch (err) {
      return refusedVerdict(err);
    }
  }

  let texts: Array<string | null>;
  try {
    texts = await Promise.all(
      entry.sources.map(async (url) => {
        try {
          return await deps.fetchSourceText(url);
        } catch (err) {
          if (err instanceof RefusedTargetError) throw err;
          return null;
        }
      }),
    );
  } catch (err) {
    if (!(err instanceof RefusedTargetError)) throw err;
    return refusedVerdict(err);
  }

  const combined = combineSourceTexts(texts);
  if (!combined.ok) return combined.verdict;
  try {
    return await gradeGrounding(
      entry.lead,
      entry.detail,
      combined.sourceText,
      deps.judge,
    );
  } catch {
    return {
      grounded: false,
      reason: "Grounding judge failed; dropping the card.",
    };
  }
}
