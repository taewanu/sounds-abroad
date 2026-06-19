import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Commentary } from "../../src/lib/chart-schema";
import {
  draftBlurb,
  type DraftClient,
  type DraftInput,
  type RawDraft,
} from "../../src/lib/drafting";

import type { WorklistItem, WorklistReason } from "./worklist";

/**
 * The drafting shell: the subprocess half of auto-drafting, whose pure prompt
 * and validation logic live in `src/lib/drafting.ts`. It maps a worklist item to
 * the prompt facts, runs `claude -p` with web search to research and draft, and
 * routes the result through the seam. Kept out of unit tests on purpose — it
 * spends the subscription and reaches the network; the tested seam and the
 * `toDraftInput` mapping below hold the decision logic.
 */

const execFileAsync = promisify(execFile);

/**
 * The structured-output contract handed to `claude -p`. Forcing the draft shape
 * means the shell reads validated fields instead of parsing prose; the claim
 * enum keeps the model on a known tier. `sources` is floored at two here, the
 * gate's corroboration minimum, so the model aims above the bar rather than at
 * the schema's one-source floor.
 */
const RAW_DRAFT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    lead: { type: "string" },
    detail: { type: "string" },
    tag: { type: "string" },
    claim: { type: "string", enum: ["what-it-is", "why-charting"] },
    sources: { type: "array", items: { type: "string" }, minItems: 2 },
  },
  required: ["lead", "tag", "claim", "sources"],
  additionalProperties: false,
});

/**
 * A DraftClient backed by the local Claude Code binary. Unlike the grounding
 * judge, the drafter must research before writing, so it keeps the web tools:
 * `--tools` makes only WebSearch and WebFetch available, and `--allowedTools`
 * permits them — both are needed, since in non-interactive mode an available
 * but un-permitted tool is auto-denied and the model drafts blind. The narrow
 * surface (no Bash/Edit) keeps it scoped rather than `--dangerously-skip-
 * permissions`. `--setting-sources ""` still strips project settings to a clean
 * turn; `--json-schema` forces the draft into `.structured_output`. `claude -p`
 * is the only sanctioned way to spend the Max subscription programmatically (the
 * raw API rejects subscription OAuth), behind this seam so an SDK key can
 * replace it in one place later.
 *
 * Throws on any non-zero exit, timeout, non-JSON output, or error envelope, so
 * the caller fails closed to no card rather than drafting against nothing.
 */
export function createClaudeDrafter(timeoutMs = 180_000): DraftClient {
  return async (prompt) => {
    const { stdout } = await execFileAsync(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--json-schema",
        RAW_DRAFT_SCHEMA,
        "--tools",
        "WebSearch,WebFetch",
        "--allowedTools",
        "WebSearch,WebFetch",
        "--setting-sources",
        "",
      ],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
    );
    const envelope = JSON.parse(stdout) as {
      is_error?: boolean;
      structured_output?: unknown;
    };
    if (envelope.is_error || !envelope.structured_output) {
      throw new Error("Drafter returned no structured output.");
    }
    return envelope.structured_output as RawDraft;
  };
}

/**
 * Plain-words context for each worklist reason, steering what the model
 * researches. The phrasing is the only signal the drafter gets for WHY a track
 * is worth a blurb, so it should read as a human would describe the chart move,
 * not echo the enum.
 */
const SIGNIFICANCE: Record<WorklistReason, (bestRank: number) => string> = {
  "new-entry": (r) => `a new chart entry, peaking at #${r}`,
  "rank-jump": (r) => `a sharp climb up the chart, now peaking at #${r}`,
  "top-debut": (r) => `a strong move into the upper chart, peaking at #${r}`,
};

/**
 * Map a worklist item to the facts the draft prompt is built from: the chart
 * positions as `cc#rank` tokens and the significance as plain words. Pure, so
 * the mapping is tested without the subprocess.
 */
export function toDraftInput(item: WorklistItem): DraftInput {
  return {
    artist: item.artist,
    name: item.name,
    significance: SIGNIFICANCE[item.reason](item.bestRank),
    chartedIn: item.countries.map((c) => `${c.cc}#${c.rank}`),
  };
}

/**
 * Draft one blurb for a worklist item end to end. The fail-closed boundary: a
 * throw from the drafter (subprocess down, timeout, bad output) drops only this
 * card as null, never aborting the batch. The draft is still only a candidate;
 * the publish gate decides what ships.
 */
export async function draftEntry(
  item: WorklistItem,
  generatedAt: string,
  drafter: DraftClient,
): Promise<Commentary | null> {
  try {
    return await draftBlurb(toDraftInput(item), generatedAt, drafter);
  } catch (error) {
    // Fail closed to null, but name why: a thrown draft is a drafter failure
    // (subprocess down, timeout) the batch log should surface, not silently drop.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`drafting "${item.name}" by ${item.artist} failed: ${reason}`);
    return null;
  }
}
