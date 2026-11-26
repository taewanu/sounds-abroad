import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { ESCAPE_LAYER, useEscapeLayer } from '@/components/use-escape-layer';
import type { AudioEngine } from '@/lib/audio-engine';
import { type AudioState, createAudioStore } from '@/lib/audio-store';
import { AudioStoreContext } from '@/providers/audio-store-provider';

import { VolumeControl } from './volume-control';

function makeMockAudio(): AudioEngine {
  return {
    src: '',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    volumeAdjustable: true,
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function renderVolumeControl(
  init?: Partial<AudioState>,
  around?: (control: ReactNode) => ReactNode,
) {
  const store = createAudioStore(() => makeMockAudio());
  if (init) {
    store.setState(init);
  }
  const control = <VolumeControl />;
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      {around ? around(control) : control}
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
}

const openPopover = () => fireEvent.click(screen.getByRole('button', { name: /volume/i }));

// Lets queued focus and dismissal work run, so a check that nothing closed is not premature.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

// Moves focus as the Tab key does: to the next tabbable element in document order.
function pressTab() {
  const tabbable = Array.from(
    document.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.matches(':disabled') && !el.closest('[hidden], [inert]'));
  const next = tabbable[tabbable.indexOf(document.activeElement as HTMLElement) + 1];
  act(() => next?.focus());
}

async function openPopoverFocused() {
  openPopover();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('slider')));
}

// A real key press targets the focused element, or the body when nothing is.
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

type Rank = (typeof ESCAPE_LAYER)[keyof typeof ESCAPE_LAYER];

function OtherLayer({ rank, onEscape }: { rank: Rank; onEscape: () => void }) {
  useEscapeLayer(true, rank, onEscape);
  return null;
}

describe('VolumeControl', () => {
  test('renders the trigger and keeps the slider hidden until opened', () => {
    renderVolumeControl();

    expect(screen.getByRole('button', { name: /volume/i })).toBeDefined();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  test('clicking the trigger reveals the slider', () => {
    renderVolumeControl();

    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    expect(screen.getByRole('slider')).toBeDefined();
    expect(screen.getByRole('button', { name: /volume/i }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  test('the slider reflects the stored volume', () => {
    renderVolumeControl({ volume: 0.5 });

    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    expect(screen.getByRole<HTMLInputElement>('slider').value).toBe('0.5');
  });

  test('dragging the slider drives the volume', () => {
    const { store } = renderVolumeControl({ volume: 1 });
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.3' } });

    expect(store.getState().volume).toBe(0.3);
  });

  test('opening focuses the slider', async () => {
    renderVolumeControl();

    openPopover();

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('slider')));
  });

  test('Escape closes the popover and returns focus to the trigger', async () => {
    renderVolumeControl();
    await openPopoverFocused();

    pressEscape();

    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /volume/i })),
    );
  });

  test('with the popover open over the sheet, one Escape closes only the popover', async () => {
    const sheetEscape = vi.fn();
    renderVolumeControl(undefined, (control) => (
      <>
        <OtherLayer rank={ESCAPE_LAYER.sheet} onEscape={sheetEscape} />
        {control}
      </>
    ));
    await openPopoverFocused();

    pressEscape();

    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
    expect(sheetEscape).not.toHaveBeenCalled();
  });

  test('with the tour up, one Escape closes only the tour', async () => {
    const tourEscape = vi.fn();
    renderVolumeControl(undefined, (control) => (
      <>
        <OtherLayer rank={ESCAPE_LAYER.tour} onEscape={tourEscape} />
        {control}
      </>
    ));
    await openPopoverFocused();

    pressEscape();
    await settle();

    expect(tourEscape).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('slider')).toBeDefined();
  });

  test("a slider drag doesn't reach the swipe surface around the control", () => {
    const swipeStart = vi.fn();
    renderVolumeControl(undefined, (control) => <div onPointerDown={swipeStart}>{control}</div>);
    openPopover();

    fireEvent.pointerDown(screen.getByRole('slider'));

    expect(swipeStart).not.toHaveBeenCalled();
  });

  test('a tap outside closes the popover', async () => {
    renderVolumeControl();
    openPopover();

    fireEvent.click(document.body);

    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
  });

  test('the dismissing tap lands on a full-screen backdrop, not the control under it', async () => {
    renderVolumeControl();
    openPopover();
    const backdrop = screen.getByTestId('volume-backdrop');

    fireEvent.click(backdrop);

    expect(backdrop.className).toMatch(/\bfixed inset-0\b/);
    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
  });

  test("a press on the backdrop doesn't reach the swipe surface around the control", () => {
    const swipeStart = vi.fn();
    renderVolumeControl(undefined, (control) => <div onPointerDown={swipeStart}>{control}</div>);
    openPopover();

    fireEvent.pointerDown(screen.getByTestId('volume-backdrop'));

    expect(swipeStart).not.toHaveBeenCalled();
  });

  test('tabbing past the last control closes the popover', async () => {
    renderVolumeControl();
    await openPopoverFocused();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    pressTab();

    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /volume/i }));
    outside.remove();
  });

  test("focus moving between the popover's controls keeps it open", async () => {
    renderVolumeControl();
    await openPopoverFocused();

    act(() => screen.getByRole('button', { name: 'Mute' }).focus());
    await settle();

    expect(screen.getByRole('slider')).toBeDefined();
  });

  test('focus released to nothing keeps the popover open', async () => {
    renderVolumeControl();
    await openPopoverFocused();

    act(() => screen.getByRole('slider').blur());
    await settle();

    expect(screen.getByRole('slider')).toBeDefined();
  });

  test('a second trigger tap closes the popover', async () => {
    renderVolumeControl();
    const trigger = screen.getByRole('button', { name: /volume/i });
    fireEvent.click(trigger);

    fireEvent.click(trigger);

    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull());
  });

  test('the popover includes a mute toggle', () => {
    renderVolumeControl();

    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    expect(screen.getByRole('button', { name: 'Mute' })).toBeDefined();
  });

  test('muting silences without changing the level', () => {
    const level = 0.6;
    const { store } = renderVolumeControl({ volume: level });
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    expect(store.getState().muted).toBe(true);
    expect(store.getState().volume).toBe(level);
  });

  test('unmuting keeps the level held before muting', () => {
    const level = 0.6;
    const { store } = renderVolumeControl({ volume: level });
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));

    expect(store.getState().muted).toBe(false);
    expect(store.getState().volume).toBe(level);
  });

  test('raising the level lifts a mute', () => {
    const { store } = renderVolumeControl({ volume: 0.6, muted: true });
    fireEvent.click(screen.getByRole('button', { name: /volume/i }));

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.3' } });

    expect(store.getState().muted).toBe(false);
  });
});
