import { type RefObject, useEffect, useState } from 'react';

// Room left between a revealed card and the list's edge, so the card's outline
// clears the viewport instead of sitting flush against it.
export const REVEAL_MARGIN_PX = 12;

/**
 * Scrolls the card's list just enough to show the card: its top first, then as
 * much of its bottom as fits without hiding the top again.
 */
export function revealInList(card: HTMLElement) {
  const list = card.closest('ol');
  if (!list) return;
  const cardRect = card.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const topRoom = cardRect.top - listRect.top - REVEAL_MARGIN_PX;
  const bottomOverflow = cardRect.bottom - listRect.bottom + REVEAL_MARGIN_PX;
  const delta = topRoom < 0 ? topRoom : Math.min(Math.max(bottomOverflow, 0), topRoom);
  if (delta !== 0) list.scrollBy({ top: delta, behavior: 'smooth' });
}

// Frames to look for the panel's transition before treating it as instant
// (reduced motion, or no height change).
const SETTLE_LOOKAHEAD_FRAMES = 4;

/**
 * Resolves once the panel's height transition has finished. Base UI marks a
 * close a render after `open` flips, and Chrome can list the exit transition a
 * frame later still, so a single look can miss it and report the close settled
 * before it starts.
 */
async function panelTransitionSettled(getPanel: () => HTMLElement | null) {
  for (let frame = 0; frame < SETTLE_LOOKAHEAD_FRAMES; frame++) {
    await new Promise(requestAnimationFrame);
    const running = getPanel()?.getAnimations() ?? [];
    if (running.length > 0) {
      await Promise.allSettled(running.map((a) => a.finished));
      return;
    }
  }
}

/**
 * After a disclosure opens or closes, waits for its panel's height transition
 * to settle and keeps the card around it in view, since growing or shrinking
 * the panel can leave the card above or below the list's viewport. Returns
 * whether the panel is still settling.
 */
export function useRevealOnToggle(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  skipReveal: boolean,
) {
  const [settledOpen, setSettledOpen] = useState(open);
  const [settling, setSettling] = useState(false);
  if (settledOpen !== open) {
    setSettledOpen(open);
    setSettling(true);
  }

  useEffect(() => {
    if (!settling) return;
    let cancelled = false;
    void panelTransitionSettled(() => panelRef.current).then(() => {
      if (cancelled) return;
      const card = rootRef.current?.closest('li');
      // Find-in-page scrolls to its own match; moving the list would hide it again.
      if (card && !skipReveal) revealInList(card);
      setSettling(false);
    });
    return () => {
      cancelled = true;
    };
  }, [settling, open, skipReveal, rootRef, panelRef]);

  return settling;
}
