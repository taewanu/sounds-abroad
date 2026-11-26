import { describe, expect, test, vi } from 'vitest';

import { REVEAL_MARGIN_PX, revealInList } from './use-reveal-on-toggle';

const LIST_TOP = 100;
const LIST_BOTTOM = 500;

function rect(top: number, bottom: number) {
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
  } as DOMRect;
}

function cardInList(cardTop: number, cardBottom: number) {
  const list = document.createElement('ol');
  const card = document.createElement('li');
  list.append(card);
  list.getBoundingClientRect = () => rect(LIST_TOP, LIST_BOTTOM);
  card.getBoundingClientRect = () => rect(cardTop, cardBottom);
  const scrollBy = vi.fn();
  list.scrollBy = scrollBy;
  return { card, scrollBy };
}

function scrolledBy(scrollBy: ReturnType<typeof vi.fn>) {
  return (scrollBy.mock.calls[0]?.[0] as ScrollToOptions | undefined)?.top;
}

describe('revealInList', () => {
  test('scrolls up to show a card whose top is above the list', () => {
    const { card, scrollBy } = cardInList(LIST_TOP - 50, LIST_TOP + 30);

    revealInList(card);

    expect(scrolledBy(scrollBy)).toBe(-50 - REVEAL_MARGIN_PX);
  });

  test('scrolls down to show a card whose bottom runs past the list', () => {
    const { card, scrollBy } = cardInList(LIST_BOTTOM - 100, LIST_BOTTOM + 40);

    revealInList(card);

    expect(scrolledBy(scrollBy)).toBe(40 + REVEAL_MARGIN_PX);
  });

  test('never scrolls a tall card down so far that its top is hidden', () => {
    const cardTop = LIST_TOP + 30;
    const { card, scrollBy } = cardInList(cardTop, LIST_BOTTOM + 300);

    revealInList(card);

    expect(scrolledBy(scrollBy)).toBe(cardTop - LIST_TOP - REVEAL_MARGIN_PX);
  });

  test('leaves a card that is already in view where it is', () => {
    const { card, scrollBy } = cardInList(LIST_TOP + 40, LIST_BOTTOM - 40);

    revealInList(card);

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
