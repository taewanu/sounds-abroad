import { fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ESCAPE_LAYER, useEscapeLayer } from './use-escape-layer';

type Rank = (typeof ESCAPE_LAYER)[keyof typeof ESCAPE_LAYER];

function Layer({
  active,
  rank,
  onEscape,
}: {
  active: boolean;
  rank: Rank;
  onEscape: () => void;
}) {
  useEscapeLayer(active, rank, onEscape);
  return null;
}

function pressEscape() {
  fireEvent.keyDown(window, { key: 'Escape' });
}

describe('useEscapeLayer', () => {
  test('one Escape reaches only the highest-ranked open layer', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <>
        <Layer active rank={ESCAPE_LAYER.sheet} onEscape={lower} />
        <Layer active rank={ESCAPE_LAYER.popover} onEscape={upper} />
      </>,
    );

    pressEscape();

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  test('a higher-ranked layer wins even when a lower one activated after it', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const { rerender } = render(
      <>
        <Layer active rank={ESCAPE_LAYER.tour} onEscape={upper} />
        <Layer active={false} rank={ESCAPE_LAYER.sheet} onEscape={lower} />
      </>,
    );
    rerender(
      <>
        <Layer active rank={ESCAPE_LAYER.tour} onEscape={upper} />
        <Layer active rank={ESCAPE_LAYER.sheet} onEscape={lower} />
      </>,
    );

    pressEscape();

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  test('between equal ranks, the most recently activated layer wins', () => {
    const earlier = vi.fn();
    const later = vi.fn();
    const { rerender } = render(
      <>
        <Layer active={false} rank={ESCAPE_LAYER.popover} onEscape={later} />
        <Layer active rank={ESCAPE_LAYER.popover} onEscape={earlier} />
      </>,
    );
    rerender(
      <>
        <Layer active rank={ESCAPE_LAYER.popover} onEscape={later} />
        <Layer active rank={ESCAPE_LAYER.popover} onEscape={earlier} />
      </>,
    );

    pressEscape();

    expect(later).toHaveBeenCalledTimes(1);
    expect(earlier).not.toHaveBeenCalled();
  });

  test('once the top layer closes, the next Escape reaches the layer below', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const { rerender } = render(
      <>
        <Layer active rank={ESCAPE_LAYER.sheet} onEscape={lower} />
        <Layer active rank={ESCAPE_LAYER.card} onEscape={upper} />
      </>,
    );
    rerender(
      <>
        <Layer active rank={ESCAPE_LAYER.sheet} onEscape={lower} />
        <Layer active={false} rank={ESCAPE_LAYER.card} onEscape={upper} />
      </>,
    );

    pressEscape();

    expect(lower).toHaveBeenCalledTimes(1);
    expect(upper).not.toHaveBeenCalled();
  });

  test('calls the handler from the latest render', () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = render(
      <Layer active rank={ESCAPE_LAYER.sheet} onEscape={stale} />,
    );
    rerender(<Layer active rank={ESCAPE_LAYER.sheet} onEscape={fresh} />);

    pressEscape();

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });
});
