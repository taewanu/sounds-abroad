import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CHART_MODES, CHART_MODE_LABELS, type ChartMode } from '@/lib/chart-mode';

import { ModeTabs } from './mode-tabs';

const [FIRST, SECOND] = CHART_MODES;

function OpenableModes({ onOpen }: { onOpen?: (mode: ChartMode) => void }) {
  const [current, setCurrent] = useState<ChartMode>(FIRST);
  return (
    <ModeTabs
      current={current}
      waiting={null}
      onOpen={(mode) => {
        onOpen?.(mode);
        setCurrent(mode);
      }}
    />
  );
}

function modeButton(mode: ChartMode) {
  return screen.getByRole('button', { name: CHART_MODE_LABELS[mode] });
}

function pressedModes() {
  return CHART_MODES.filter((mode) => modeButton(mode).getAttribute('aria-pressed') === 'true');
}

describe('ModeTabs', () => {
  test('presses only the mode on screen', () => {
    render(<ModeTabs current={SECOND} waiting={null} onOpen={() => {}} />);

    expect(pressedModes()).toEqual([SECOND]);
  });

  test('opens a mode when it is pressed, and then presses only that one', () => {
    const onOpen = vi.fn();
    render(<OpenableModes onOpen={onOpen} />);

    fireEvent.click(modeButton(SECOND));

    expect(onOpen).toHaveBeenCalledWith(SECOND);
    expect(pressedModes()).toEqual([SECOND]);
  });

  test('keeps the mode on screen pressed when it is pressed again', () => {
    render(<OpenableModes />);

    fireEvent.click(modeButton(FIRST));

    expect(pressedModes()).toEqual([FIRST]);
  });

  test('is one tab stop, and an arrow key moves focus to the next mode without opening it', async () => {
    const onOpen = vi.fn();
    render(<OpenableModes onOpen={onOpen} />);
    const tabStops = () => CHART_MODES.filter((mode) => modeButton(mode).tabIndex === 0);

    expect(tabStops()).toHaveLength(1);

    modeButton(FIRST).focus();
    fireEvent.keyDown(modeButton(FIRST), { key: 'ArrowRight' });
    // Base UI moves focus in a microtask after the keydown.
    await act(async () => {});

    expect(document.activeElement).toBe(modeButton(SECOND));
    expect(tabStops()).toEqual([SECOND]);
    expect(onOpen).not.toHaveBeenCalled();
    expect(pressedModes()).toEqual([FIRST]);
  });

  test('marks only the mode still being read as waiting', () => {
    render(<ModeTabs current={SECOND} waiting={SECOND} onOpen={() => {}} />);

    expect(modeButton(SECOND).classList).toContain('chart-tab-waiting');
    expect(modeButton(FIRST).classList).not.toContain('chart-tab-waiting');
  });

  describe('underline', () => {
    // jsdom lays nothing out, so each button reports a box derived from its position in the row.
    beforeEach(() => {
      const indexOf = (el: HTMLElement) => Array.from(el.parentElement?.children ?? []).indexOf(el);
      vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return indexOf(this) * 100;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return 40 + indexOf(this);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('sits under the pressed label and moves with the selection', () => {
      const { container } = render(<OpenableModes />);
      const underline = () => container.querySelector<HTMLElement>('[aria-hidden]');

      expect(underline()?.style.transform).toBe('translateX(0px) scaleX(40)');

      fireEvent.click(modeButton(SECOND));

      expect(underline()?.style.transform).toBe('translateX(100px) scaleX(41)');
    });
  });
});
