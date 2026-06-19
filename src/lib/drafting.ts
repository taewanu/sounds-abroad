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
 * The drafting instructions, shaped by the gate the draft must pass. Its core
 * rule separates signal from claim: the chart positions we feed in are why we
 * PICKED the track, not something to assert, since they are our own ranking data
 * and no outlet reports them, so grounding can never verify them. The lead and
 * detail must instead claim a stable, press-backed fact about the song; the
 * timely hook lives in the tag, which grounding does not check. The model is
 * pointed at specific articles it has read, the authority allowlist, and the
 * no-lyric rule, so it drafts toward what the gate accepts rather than against it.
 */
export function buildDraftPrompt(input: DraftInput): string {
  return [
    "You write a short, factual blurb about a song for a music-discovery app, then cite where each fact is stated.",
    "Research the track with web search and open the pages before writing.",
    "",
    "What to claim:",
    "- Default to a stable, well-documented fact about the SONG ITSELF: its release, album, collaborators, genre, or a milestone a major outlet reported (e.g. a first #1 on a named chart).",
    "- Give a time-sensitive reason it is rising only when a source explicitly states that cause; otherwise stay with the stable fact.",
    "- The chart positions below are OUR OWN ranking data and only tell you why we picked the track. No outlet publishes them, so never assert them as fact in the lead or detail; they cannot be verified. Treat them as context only.",
    "",
    "Write:",
    "- lead: one sentence, the single most interesting verifiable fact about the song.",
    "- detail: an optional second sentence of context. Omit it rather than pad.",
    '- tag: a 2-4 word hook for why it matters now (e.g. "new top-5 debut"). This is a hook, not a verified claim, and may reflect the chart movement.',
    '- claim: "what-it-is" for a stable fact about the song, or "why-charting" for a stated, time-sensitive reason it is moving.',
    "- sources: two or more URLs to specific articles or reviews you opened that EXPLICITLY STATE every claim in your lead and detail. Never cite an artist hub, a tag or category page, a search page, or a homepage; they state nothing. A claim a source only implies does not count; a later check drops any claim its sources do not state.",
    "",
    `At least one source must be from this trusted-outlet list: ${[...AUTHORITY_ALLOWLIST].join(", ")}. Use Wikipedia only to find the primary sources it cites, never as a cited source. Never cite lyrics sites, fan wikis, or gossip/SEO farms.`,
    "",
    "Never reproduce song lyrics. Describe the song; do not quote its words.",
    "",
    `TRACK: "${input.name}" by ${input.artist}`,
    `WHY WE PICKED IT (our data, context only): ${input.significance}, charting at ${input.chartedIn.join(", ")}`,
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
