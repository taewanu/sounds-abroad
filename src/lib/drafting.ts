import { CommentarySchema, type Commentary } from "./chart-schema";
import { AUTHORITY_ALLOWLIST } from "./source-authority";

/**
 * The drafting seam: an LLM researches a charting track and writes a candidate
 * blurb, in place of a human authoring it (#121). This module is the pure half
 * of the auto-drafting step, mirroring `grounding.ts`: it builds the prompt and
 * validates the model's output, while the network-and-subprocess research call
 * lives in an injectable shell. The model is reached through an injected client,
 * so the auth and model backend (claude -p now, an SDK key later) stay swappable.
 *
 * A draft is only a CANDIDATE: it still runs the publish gate (`routeStore`),
 * which grounds the claims against the cited sources and drops anything that
 * fails. So this seam fails safe to null on a malformed draft rather than
 * trusting the model's shape, and the gate, not this step, is the trust arbiter.
 */

/** The structured fields the drafting model returns, before validation. */
export interface RawDraft {
  lead: string;
  detail?: string;
  tag: string;
  claim: string;
  sources: string[];
}

export type DraftClient = (prompt: string) => Promise<RawDraft>;

/** The track facts the prompt is built from, mapped from a worklist item. */
export interface DraftInput {
  artist: string;
  name: string;
  /** Why the track is on the worklist, in plain words (e.g. "a top-5 debut"). */
  significance: string;
  /** Where it charts, as `cc#rank` tokens (e.g. ["us#1", "ca#2"]). */
  chartedIn: string[];
}

/**
 * The drafting instructions. It states the claim-tier choice, the source policy
 * the gate will enforce (authoritative outlets, two or more, that explicitly
 * STATE the claims so grounding passes), and the no-lyric rule, so the model
 * drafts toward what the gate accepts rather than against it.
 */
export function buildDraftPrompt(input: DraftInput): string {
  return [
    "You write a short, factual blurb about why a song is on a music chart, for a discovery app.",
    "Research the track with web search before writing. Never cite lyrics sites, fan wikis, or gossip/SEO farms.",
    `At least one source MUST come from this trusted-outlet list: ${[...AUTHORITY_ALLOWLIST].join(", ")}. Use a Wikipedia article only to find the primary sources it cites, never as a cited source itself.`,
    "",
    "Write:",
    "- lead: one sentence, the single most interesting true thing about the song or its chart run.",
    "- detail: an optional second sentence with context. Omit it rather than pad.",
    '- tag: a 2-4 word hook naming why it matters now (e.g. "new top-5 debut").',
    '- claim: "what-it-is" for a stable fact about the song, or "why-charting" for a time-sensitive reason it is moving. Only choose why-charting when a source states the cause.',
    "- sources: two or more URLs to authoritative pages that EXPLICITLY STATE every claim you make. A claim a source only implies does not count; a later check drops any claim its sources do not state.",
    "",
    "Never reproduce song lyrics. Describe the song; do not quote its words.",
    "",
    `TRACK: "${input.name}" by ${input.artist}`,
    `SIGNIFICANCE: ${input.significance}`,
    `CHARTING: ${input.chartedIn.join(", ")}`,
  ].join("\n");
}

/**
 * Validate the model's draft into a schema-valid commentary entry, stamping the
 * supplied timestamp. Returns null on any schema failure (bad claim tier,
 * non-URL or missing sources, empty lead), so a malformed draft is dropped
 * rather than published. The timestamp is injected, not read here, to keep the
 * seam pure and testable.
 */
export function interpretDraft(
  raw: RawDraft,
  generatedAt: string,
): Commentary | null {
  const parsed = CommentarySchema.safeParse({ ...raw, generatedAt });
  return parsed.success ? parsed.data : null;
}

/**
 * Draft one blurb end to end: build the prompt, ask the injected client, and
 * validate the result. The orchestrator stays pure given its client, so the
 * decision logic is tested without the research call.
 */
export async function draftBlurb(
  input: DraftInput,
  generatedAt: string,
  client: DraftClient,
): Promise<Commentary | null> {
  const raw = await client(buildDraftPrompt(input));
  return interpretDraft(raw, generatedAt);
}
