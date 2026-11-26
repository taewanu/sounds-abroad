import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { ESCAPE_LAYER, useEscapeLayer } from '@/components/use-escape-layer';
import { globeChartStore } from '@/lib/globe-chart-store';

import { CountrySelector } from './country-selector';

const openList = () => fireEvent.click(screen.getByRole('button', { name: /choose a country/i }));

// Lets queued focus and dismissal work run, so a check that nothing moved is not premature.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

const queryList = () => screen.queryByRole('navigation', { name: 'Countries' });

// A real key press targets the focused element, or the body when nothing is.
const pressEscape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

// Moves focus as the Tab key does: to the next tabbable element in document order.
function pressTab() {
  const tabbable = Array.from(
    document.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.matches(':disabled') && !el.closest('[hidden], [inert]'));
  const next = tabbable[tabbable.indexOf(document.activeElement as HTMLElement) + 1];
  act(() => next?.focus());
}

type Rank = (typeof ESCAPE_LAYER)[keyof typeof ESCAPE_LAYER];

function OtherLayer({ rank, onEscape }: { rank: Rank; onEscape: () => void }) {
  useEscapeLayer(true, rank, onEscape);
  return null;
}

describe('CountrySelector', () => {
  let pushState: MockInstance<History['pushState']>;
  let replaceState: MockInstance<History['replaceState']>;

  beforeEach(() => {
    globeChartStore.setState({ selectedCountry: 'br', readMode: false });
    pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    globeChartStore.setState({ selectedCountry: null, readMode: false });
    pushState.mockRestore();
    replaceState.mockRestore();
  });

  test('labels the toggle with the current country and starts collapsed', () => {
    render(<CountrySelector />);

    const toggle = screen.getByRole('button', {
      name: /currently showing Brazil/i,
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.hasAttribute('aria-haspopup')).toBe(false);
    expect(screen.queryByRole('navigation', { name: 'Countries' })).toBeNull();
  });

  test('opens a Countries landmark of named country buttons', () => {
    render(<CountrySelector />);

    openList();

    const nav = screen.getByRole('navigation', { name: 'Countries' });
    expect(within(nav).getByRole('button', { name: 'France' })).toBeDefined();
    expect(within(nav).getByRole('button', { name: 'Japan' })).toBeDefined();
  });

  test('groups the countries into labeled continent regions', () => {
    render(<CountrySelector />);
    openList();

    const americas = screen.getByRole('group', { name: 'Americas' });
    expect(within(americas).getByRole('button', { name: 'Brazil' })).toBeDefined();
    for (const region of ['Americas', 'Europe', 'Africa', 'Asia', 'Oceania']) {
      expect(screen.getByRole('group', { name: region })).toBeDefined();
    }
  });

  test('selecting a country drives the globe via the store and announces it', () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole('button', { name: 'France' }));

    expect(globeChartStore.getState().selectedCountry).toBe('fr');
    expect(screen.getByRole('status').textContent).toContain('France');
  });

  test('each pick pushes its own entry, so back walks the picks in reverse', () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole('button', { name: 'France' }));
    fireEvent.click(screen.getByRole('button', { name: 'Japan' }));

    expect(pushState).toHaveBeenNthCalledWith(1, null, '', '/c/fr');
    expect(pushState).toHaveBeenNthCalledWith(2, null, '', '/c/jp');
    expect(replaceState).not.toHaveBeenCalled();
  });

  test('picking the country already showing spends no history entry', () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole('button', { name: 'Brazil' }));

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Brazil');
  });

  test('stays open after selecting so exploration can continue', async () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole('button', { name: 'France' }));
    await settle();

    expect(screen.getByRole('navigation', { name: 'Countries' })).toBeDefined();
  });

  test('opening leaves focus on the toggle', async () => {
    render(<CountrySelector />);
    const toggle = screen.getByRole('button', { name: /choose a country/i });
    act(() => toggle.focus());

    fireEvent.click(toggle);

    await screen.findByRole('navigation', { name: 'Countries' });
    await settle();
    expect(document.activeElement).toBe(toggle);
  });

  test('Escape closes the list and returns focus to the toggle', async () => {
    render(<CountrySelector />);
    const toggle = screen.getByRole('button', { name: /choose a country/i });
    fireEvent.click(toggle);
    act(() => screen.getByRole('button', { name: 'France' }).focus());

    pressEscape();

    await waitFor(() => expect(queryList()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  test('with the list open over the sheet, one Escape closes only the list', async () => {
    const sheetEscape = vi.fn();
    render(
      <>
        <OtherLayer rank={ESCAPE_LAYER.sheet} onEscape={sheetEscape} />
        <CountrySelector />
      </>,
    );
    openList();

    pressEscape();

    await waitFor(() => expect(queryList()).toBeNull());
    expect(sheetEscape).not.toHaveBeenCalled();
  });

  test('with the tour up, one Escape closes only the tour', async () => {
    const tourEscape = vi.fn();
    render(
      <>
        <OtherLayer rank={ESCAPE_LAYER.tour} onEscape={tourEscape} />
        <CountrySelector />
      </>,
    );
    openList();

    pressEscape();
    await settle();

    expect(tourEscape).toHaveBeenCalledTimes(1);
    expect(queryList()).not.toBeNull();
  });

  test('the close button closes the list and returns focus to the toggle', async () => {
    render(<CountrySelector />);
    const toggle = screen.getByRole('button', { name: /choose a country/i });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole('button', { name: /close country list/i }));

    await waitFor(() => expect(queryList()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  test('tabbing out of the list closes it and leaves focus where Tab sent it', async () => {
    render(<CountrySelector />);
    openList();
    const pills = within(await screen.findByRole('navigation', { name: 'Countries' })).getAllByRole(
      'button',
    );
    const after = document.createElement('button');
    document.body.appendChild(after);
    act(() => pills[pills.length - 1].focus());

    pressTab();

    await waitFor(() => expect(queryList()).toBeNull());
    await settle();
    expect(document.activeElement).toBe(after);
    after.remove();
  });

  test('tapping the scrim closes the list without moving focus to the toggle', async () => {
    // Browsers read `preventScroll` from focus options; the test DOM ignores
    // them, which would hide a focus return that only runs where it is read.
    const focus = HTMLElement.prototype.focus;
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      void options?.preventScroll;
      focus.call(this);
    });
    render(<CountrySelector />);
    const toggle = screen.getByRole('button', { name: /choose a country/i });
    fireEvent.click(toggle);
    act(() => screen.getByRole('button', { name: 'France' }).focus());

    fireEvent.click(screen.getByTestId('country-scrim'));

    await waitFor(() => expect(queryList()).toBeNull());
    await settle();
    expect(document.activeElement).not.toBe(toggle);
    focusSpy.mockRestore();
  });

  test("in read mode the badge is inert and non-interactive, off the sheet's grip", () => {
    globeChartStore.setState({ readMode: true });

    render(<CountrySelector />);

    const region = screen.getByTestId('country-toggle-region');
    expect(region.getAttribute('inert')).not.toBeNull();
    expect(region.className).toContain('pointer-events-none');
  });

  test('leaving read mode restores the badge to interactive', () => {
    globeChartStore.setState({ readMode: false });

    render(<CountrySelector />);

    const region = screen.getByTestId('country-toggle-region');
    expect(region.getAttribute('inert')).toBeNull();
    expect(region.className).not.toContain('pointer-events-none');
  });
});
