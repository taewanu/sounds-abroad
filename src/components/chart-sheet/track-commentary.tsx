'use client';

import { Fragment, useRef, useState } from 'react';

import { ChevronDownIcon } from '@/components/icons/chevron-down';
import { ExpandIcon } from '@/components/icons/expand';
import { MinimizeIcon } from '@/components/icons/minimize';
import * as Collapsible from '@/components/ui/collapsible';
import type { Commentary } from '@/lib/chart-schema';

import { useCommentaryHintPulse } from './use-commentary-hint-pulse';
import { useRevealOnToggle } from './use-reveal-on-toggle';

// Cited sources show as bare hostnames; drop a leading www. for scannability.
const WWW_PREFIX = /^www\./;
function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, '');
  } catch {
    return url;
  }
}

// The detail paragraph and the cited sources, split so the focused card can rise
// them in as two staggered beats; the gem accordion composes them via
// CommentaryDetail. Both surfaces render identical commentary depth.
function CommentaryText({ commentary }: { commentary: Commentary }) {
  if (!commentary.detail) return null;
  return <p className="text-small leading-relaxed text-fg-2">{commentary.detail}</p>;
}

function CommentarySources({ commentary }: { commentary: Commentary }) {
  return (
    <div className="flex flex-wrap items-center gap-y-2 text-micro text-fg-3">
      {commentary.sources.map((url, i) => (
        <Fragment key={`${url}-${i}`}>
          {i > 0 ? (
            <span aria-hidden className="mx-2 text-fg-4">
              ·
            </span>
          ) : null}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 focus-ring hover:text-fg-1 hover:underline"
          >
            {sourceLabel(url)}
          </a>
        </Fragment>
      ))}
    </div>
  );
}

function CommentaryDetail({ commentary }: { commentary: Commentary }) {
  return (
    <div className="flex flex-col gap-2 px-1 pt-2 pb-1">
      <CommentaryText commentary={commentary} />
      <CommentarySources commentary={commentary} />
    </div>
  );
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="shrink-0 rounded-pill bg-fg-1/5 px-2 py-0.5 text-micro text-fg-3">{tag}</span>
  );
}

// Only mounted on the single hint-target row, so its store reads and observer
// are paid once. The pulse animates this wrapper, not the SVG inside it.
function HintedGlyph({ children }: { children: React.ReactNode }) {
  const { chevronRef, pulsing } = useCommentaryHintPulse();
  return (
    <span
      ref={chevronRef}
      data-commentary-hint={pulsing || undefined}
      className="inline-flex shrink-0 items-center justify-center"
    >
      {children}
    </span>
  );
}

function PlainGlyph({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center justify-center">{children}</span>;
}

export interface TrackCommentaryProps {
  commentary: Commentary;
  // True on the single row eligible for the one-time discovery pulse (see
  // first-commentary-rank.ts). Callers outside the ranked list, like the gem
  // card, never pass this.
  isHintTarget?: boolean;
  // Present only for the chart-row usage. When given, the teaser opens the row's
  // focused reader card (the lead un-clamps, detail/sources show, a close control
  // appears) instead of expanding inline; the gem card omits it and keeps the
  // inline accordion.
  focusCard?: {
    active: boolean;
    onOpen: (source: CommentaryOpenSource) => void;
    onClose: () => void;
  };
}

/** A press on the teaser, or a find-in-page match revealing the closed card. */
export type CommentaryOpenSource = 'press' | 'find';

// The tag/lead teaser plus its depth. Two shells over one body:
// - gem card (no `focusCard`): an inline accordion that expands the detail here.
// - chart row (`focusCard`): a teaser that opens the row's focused reader card,
//   so the "why it's here" reads with room instead of fighting the cramped row.
export function TrackCommentary({ commentary, isHintTarget, focusCard }: TrackCommentaryProps) {
  const Glyph = isHintTarget ? HintedGlyph : PlainGlyph;
  const [inlineOpen, setInlineOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = focusCard ? focusCard.active : inlineOpen;
  const [openedByFind, setOpenedByFind] = useState(false);
  if (!open && openedByFind) setOpenedByFind(false);
  const settling = useRevealOnToggle(open, rootRef, panelRef, openedByFind);
  // A closing panel stays visible while it shrinks but must not take focus; once
  // closed, Base UI hides it until found, which inert would block.
  const panelProps = {
    ref: panelRef,
    hiddenUntilFound: true,
    inert: (!open && settling) || undefined,
    'data-found': (open && openedByFind) || undefined,
    className: 'commentary-reveal -mx-1',
  };

  if (focusCard) {
    const { active, onOpen, onClose } = focusCard;
    return (
      <Collapsible.Root
        ref={rootRef}
        open={active}
        onOpenChange={(next, { event }) => {
          const found = event.type === 'beforematch';
          setOpenedByFind(found);
          if (next) onOpen(found ? 'find' : 'press');
          else onClose();
        }}
        className="mt-2.5 border-t border-fg-1/10 pt-2.5"
      >
        {active ? (
          // Open: the badge sits on its own top row with the collapse cue, above
          // a full-width lead. The whole button toggles closed (tap the card
          // again), so there's no separate close control. Its content names it,
          // so the full lead is announced and aria-expanded carries the action.
          <Collapsible.Trigger className="block w-full text-left">
            <div className="flex items-center gap-2">
              <TagPill tag={commentary.tag} />
              <MinimizeIcon className="ml-auto h-4 w-4 shrink-0 text-fg-3" />
            </div>
            <p className="mt-2 text-small leading-relaxed text-fg-2">{commentary.lead}</p>
          </Collapsible.Trigger>
        ) : (
          // Teaser: the compact hook. Pill + clamped lead + an "open into a
          // larger view" icon (a chevron would imply an in-place fold).
          <Collapsible.Trigger
            data-commentary-teaser
            className="flex w-full items-center gap-2 text-left"
          >
            <TagPill tag={commentary.tag} />
            <span className="line-clamp-2 min-w-0 flex-1 text-small text-fg-2">
              {commentary.lead}
            </span>
            <Glyph>
              <ExpandIcon className="h-4 w-4 text-fg-3" />
            </Glyph>
          </Collapsible.Trigger>
        )}
        <Collapsible.Panel {...panelProps}>
          <div className="flex flex-col gap-2 px-1 pt-2 pb-1">
            {commentary.detail ? (
              <div className="commentary-rise">
                <CommentaryText commentary={commentary} />
              </div>
            ) : null}
            <div className="commentary-rise commentary-rise-late">
              <CommentarySources commentary={commentary} />
            </div>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    );
  }

  return (
    <Collapsible.Root
      ref={rootRef}
      open={inlineOpen}
      onOpenChange={(next, { event }) => {
        setOpenedByFind(event.type === 'beforematch');
        setInlineOpen(next);
      }}
      className="mt-2.5 border-t border-fg-1/10 pt-2.5"
    >
      <Collapsible.Trigger className="group flex w-full items-center gap-2 text-left">
        <TagPill tag={commentary.tag} />
        <span className="line-clamp-2 min-w-0 flex-1 text-small text-fg-2">{commentary.lead}</span>
        <Glyph>
          <ChevronDownIcon className="h-4 w-4 text-fg-3 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
        </Glyph>
      </Collapsible.Trigger>
      <Collapsible.Panel {...panelProps}>
        <CommentaryDetail commentary={commentary} />
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
