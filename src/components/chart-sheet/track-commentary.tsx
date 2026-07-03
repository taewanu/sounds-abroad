"use client";

import { Fragment, useId, useState } from "react";

import { ChevronDownIcon } from "@/components/icons/chevron-down";
import type { Commentary } from "@/lib/chart-schema";

import { useCommentaryHintPulse } from "./use-commentary-hint-pulse";

// Cited sources show as bare hostnames; drop a leading www. for scannability.
const WWW_PREFIX = /^www\./;
function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, "");
  } catch {
    return url;
  }
}

function ChevronGlyph({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDownIcon
      data-expanded={expanded || undefined}
      className="text-fg-3 h-4 w-4 transition-transform duration-200 ease-[var(--ease-out)] data-[expanded]:rotate-180 motion-reduce:transition-none"
    />
  );
}

// Only mounted on the single hint-target row, so its store reads and observer
// are paid once. The pulse animates this wrapper, not the SVG inside it.
function HintedChevron({ expanded }: { expanded: boolean }) {
  const { chevronRef, pulsing } = useCommentaryHintPulse();
  return (
    <span
      ref={chevronRef}
      data-commentary-hint={pulsing || undefined}
      className="inline-flex shrink-0 items-center justify-center"
    >
      <ChevronGlyph expanded={expanded} />
    </span>
  );
}

export interface TrackCommentaryProps {
  commentary: Commentary;
  // True on the single row eligible for the one-time discovery pulse (see
  // first-commentary-rank.ts). Callers outside the ranked list, like the gem
  // card, never pass this.
  isHintTarget?: boolean;
}

// The expandable tag/lead/detail/sources panel, shared by TrackRow and the gem
// card so both surfaces reuse identical commentary markup rather than each
// carrying its own copy.
export function TrackCommentary({
  commentary,
  isHintTarget,
}: TrackCommentaryProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div className="border-fg-1/10 mt-2.5 border-t pt-2.5">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="focus-visible:outline-aurora flex w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="bg-fg-1/5 text-fg-3 text-micro rounded-pill shrink-0 px-2 py-0.5">
          {commentary.tag}
        </span>
        <span className="text-fg-2 text-small line-clamp-2 min-w-0 flex-1">
          {commentary.lead}
        </span>
        {isHintTarget ? (
          <HintedChevron expanded={expanded} />
        ) : (
          <span className="inline-flex shrink-0 items-center justify-center">
            <ChevronGlyph expanded={expanded} />
          </span>
        )}
      </button>
      <div
        id={panelId}
        inert={!expanded}
        data-expanded={expanded || undefined}
        className="max-h-0 overflow-hidden transition-[max-height] duration-300 ease-[var(--ease-out)] data-[expanded]:max-h-96 motion-reduce:transition-none"
      >
        <div className="flex flex-col gap-2 pt-2">
          {commentary.detail ? (
            <p className="text-fg-2 text-small leading-relaxed">
              {commentary.detail}
            </p>
          ) : null}
          <div className="text-fg-3 text-micro flex flex-wrap items-center gap-y-1">
            {commentary.sources.map((url, i) => (
              <Fragment key={`${url}-${i}`}>
                {i > 0 ? (
                  <span aria-hidden className="text-fg-4 mx-2">
                    ·
                  </span>
                ) : null}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg-1 focus-visible:outline-aurora underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {sourceLabel(url)}
                </a>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
