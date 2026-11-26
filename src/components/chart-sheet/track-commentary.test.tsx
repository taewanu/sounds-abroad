import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';

import type { Commentary } from '@/lib/chart-schema';

import { TrackCommentary } from './track-commentary';

const COMMENTARY = {
  lead: 'A new entry climbing fast this week.',
  detail: 'Brief context on why the track is rising.',
  tag: 'new entry',
  claim: 'why-charting',
  sources: ['https://www.billboard.com/charts'],
  generatedAt: '2026-04-25T03:00:00Z',
} satisfies Commentary;

// A closed panel's content must stay out of the tab order and away from assistive tech.
function isHiddenFromUsers(el: Element) {
  return el.closest('[inert], [hidden]') !== null;
}

function detail() {
  return screen.getByText(COMMENTARY.detail);
}

function FocusCardHost() {
  const [active, setActive] = useState(false);
  return (
    <TrackCommentary
      commentary={COMMENTARY}
      focusCard={{ active, onOpen: () => setActive(true), onClose: () => setActive(false) }}
    />
  );
}

const SHELLS = [
  ['inline accordion', () => <TrackCommentary commentary={COMMENTARY} />],
  ['focus card', () => <FocusCardHost />],
] as const;

describe.each(SHELLS)('TrackCommentary %s', (_, renderShell) => {
  test('starts closed, with its detail hidden from users', () => {
    render(renderShell());

    expect(screen.getByRole('button', { expanded: false })).toBeDefined();
    expect(isHiddenFromUsers(detail())).toBe(true);
  });

  test('opening exposes the detail and sources to users', () => {
    render(renderShell());

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { expanded: true })).toBeDefined();
    expect(isHiddenFromUsers(detail())).toBe(false);
    expect(isHiddenFromUsers(screen.getByRole('link', { name: 'billboard.com' }))).toBe(false);
  });

  test('closing hides the detail from users again', () => {
    render(renderShell());
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    fireEvent.click(screen.getByRole('button', { expanded: true }));

    expect(screen.getByRole('button', { expanded: false })).toBeDefined();
    expect(isHiddenFromUsers(detail())).toBe(true);
  });

  test('under reduced motion, every element that animates the reveal has its transition turned off', () => {
    render(renderShell());
    const trigger = screen.getByRole('button', { expanded: false });
    fireEvent.click(trigger);
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;

    const animated = [panel, ...panel.querySelectorAll('.commentary-rise')];

    for (const el of animated) {
      expect(transitionOffUnderReducedMotion(el)).toBe(true);
    }
  });
});

const REDUCED_MOTION_SELECTORS = reducedMotionTransitionOffSelectors();

function transitionOffUnderReducedMotion(el: Element) {
  return [...el.classList].some(
    (name) => name === 'motion-reduce:transition-none' || REDUCED_MOTION_SELECTORS.has(`.${name}`),
  );
}

function reducedMotionTransitionOffSelectors() {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8');
  const selectors = new Set<string>();
  for (const block of css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)) {
    for (const [, selectorList, body] of block[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/transition:\s*none/.test(body)) continue;
      for (const selector of selectorList.split(',')) selectors.add(selector.trim());
    }
  }
  return selectors;
}
