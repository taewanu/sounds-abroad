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
    // One frame so the height transition has started and is listed.
    const frame = requestAnimationFrame(() => {
      const animations = panelRef.current?.getAnimations() ?? [];
      void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
        if (cancelled) return;
        const card = rootRef.current?.closest('li');
        // Find-in-page scrolls to its own match; moving the list would hide it again.
        if (card && !skipReveal) revealInList(card);
        setSettling(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [settling, open, skipReveal, rootRef, panelRef]);

  return settling;
}
