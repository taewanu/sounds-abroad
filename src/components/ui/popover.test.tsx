import { Popover as BasePopover } from '@base-ui/react/popover';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ESCAPE_LAYER, useEscapeLayer } from '@/components/use-escape-layer';

import * as Popover from './popover';

type Rank = (typeof ESCAPE_LAYER)[keyof typeof ESCAPE_LAYER];

function OtherLayer({ rank, onEscape }: { rank: Rank; onEscape: () => void }) {
  useEscapeLayer(true, rank, onEscape);
  return null;
}

function OpenPopover({ parts = Popover }: { parts?: Pick<typeof Popover, keyof typeof Popover> }) {
  return (
    <parts.Root defaultOpen>
      <parts.Trigger>Open</parts.Trigger>
      <parts.Portal>
        <parts.Positioner>
          <parts.Popup>
            <button type="button">Inside</button>
          </parts.Popup>
        </parts.Positioner>
      </parts.Portal>
    </parts.Root>
  );
}

const pressEscapeOn = (target: Element) => fireEvent.keyDown(target, { key: 'Escape' });

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe('Base UI Popover Escape order', () => {
  const windowKeyDown = vi.fn();

  afterEach(() => {
    window.removeEventListener('keydown', windowKeyDown);
    windowKeyDown.mockReset();
  });

  test.each([
    ['the body', () => document.body],
    ['the trigger', () => screen.getByRole('button', { name: 'Open' })],
    ['a control in the popup', () => screen.getByRole('button', { name: 'Inside' })],
  ])('closes on an Escape at %s and stops it before window listeners', async (_, target) => {
    render(<OpenPopover parts={BasePopover} />);
    await screen.findByRole('button', { name: 'Inside' });
    window.addEventListener('keydown', windowKeyDown);

    pressEscapeOn(target());

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull());
    expect(windowKeyDown).not.toHaveBeenCalled();
  });
});

describe('Popover', () => {
  test('passes Escape to a higher escape layer and stays open', async () => {
    const tourEscape = vi.fn();
    render(
      <>
        <OtherLayer rank={ESCAPE_LAYER.tour} onEscape={tourEscape} />
        <OpenPopover />
      </>,
    );
    const inside = await screen.findByRole('button', { name: 'Inside' });

    pressEscapeOn(inside);
    await settle();

    expect(tourEscape).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Inside' })).toBeDefined();
  });

  test('closes on Escape over a lower escape layer, which never sees it', async () => {
    const sheetEscape = vi.fn();
    render(
      <>
        <OtherLayer rank={ESCAPE_LAYER.sheet} onEscape={sheetEscape} />
        <OpenPopover />
      </>,
    );
    const inside = await screen.findByRole('button', { name: 'Inside' });

    pressEscapeOn(inside);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull());
    expect(sheetEscape).not.toHaveBeenCalled();
  });
});
