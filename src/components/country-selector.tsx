'use client';

import { useId, useRef, useState } from 'react';

import { ESCAPE_LAYER, useEscapeLayer } from '@/components/use-escape-layer';
import { countryPath } from '@/lib/chart-url';
import { COUNTRIES } from '@/lib/countries';
import { countryByCode } from '@/lib/country-code';
import { globeChartStore, useGlobeChart } from '@/lib/globe-chart-store';

// Group the grid by continent, west-to-east so it mirrors the globe's eastward
// spin; alphabetical within each region.
const REGION_ORDER = ['Americas', 'Europe', 'Africa', 'Asia', 'Oceania'] as const;

const COUNTRIES_BY_REGION = REGION_ORDER.map((region) => ({
  region,
  countries: COUNTRIES.filter((c) => c.region === region).sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
}));

// ISO 3166-1 alpha-2 → regional-indicator flag emoji. Decorative only (the
// country name carries the meaning); degrades to the letter pair on platforms
// without flag glyphs (e.g. Windows).
function flagEmoji(code: string): string {
  const offset = 0x1f1e6 - 'a'.charCodeAt(0);
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

// A keyboard- and screen-reader-first way to pick a country, equal to the globe
// gesture: a labeled landmark of named country buttons. A pick drives the globe
// through the globe-chart store; the grid stays open so you can keep hopping.
export function CountrySelector() {
  // The selected country comes from the store, not useSearchParams: this badge
  // is a layout backdrop, where that hook is frozen to its first value and
  // never sees a client-side country change. The chart publishes the resolved
  // country to the store; the globe and this badge read it from there.
  const currentCode = useGlobeChart((s) => s.selectedCountry);
  const current = currentCode ? countryByCode(currentCode) : null;

  // At sheet full the chart's grip and title sit where this badge floats, so
  // recede it, the same rule that suspends the globe spin. The seam is the
  // store, not the sheet tree, so the selector stays decoupled from the sheet.
  const readMode = useGlobeChart((s) => s.readMode);

  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navId = useId();

  // Read mode makes the wrapper inert, so the list must never render open behind
  // it. Derive that here rather than correcting `open` in an effect: the list is
  // open only when the user opened it AND the badge isn't receded.
  const listOpen = open && !readMode;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  };

  const handleSelect = (code: string, name: string) => {
    // A pick is the most deliberate way to choose a country, so it pushes and
    // back returns to the one before it. Re-picking the country already showing
    // changes nothing, so it spends no entry, the same rule the globe applies
    // to a settle that lands where it already was. Writing history before the
    // store keeps back working whatever the store's listeners do.
    if (code !== currentCode) {
      window.history.pushState(null, '', countryPath(code));
    }
    // The store reaches the layout globe, whose useSearchParams cannot see this.
    globeChartStore.getState().setSelectedCountry(code);
    setAnnouncement(`Now showing ${name}`);
  };

  // Escape closes and returns focus to the toggle, the one focus move a
  // disclosure needs. (No focus trap; tab order alone walks in and out.)
  useEscapeLayer(listOpen, ESCAPE_LAYER.popover, () => close(true));

  return (
    <>
      {/* Scrim: dims the globe, is the big easy tap-to-dismiss target, and
          intercepts the pointer so a dismiss tap never spins the globe. */}
      {listOpen ? (
        <div
          data-testid="country-scrim"
          aria-hidden="true"
          onClick={() => close(false)}
          className="fixed inset-0 z-30 bg-[rgba(5,6,8,0.5)] backdrop-blur-[1px]"
        />
      ) : null}

      <div
        // The badge slides up and fades as the sheet rises over it, bound to
        // --sheet-cover so it tracks the drag at any speed and settles in step
        // (the sheet owns that var's easing). inert + pointer-events follow the
        // settled read mode, pulling the receded badge out of focus and taps.
        inert={readMode}
        data-testid="country-toggle-region"
        style={{
          transform: 'translateY(calc(var(--sheet-cover, 0) * var(--badge-recede-rise, -64px)))',
          opacity: 'calc(1 - var(--sheet-cover, 0))',
        }}
        className={`fixed top-[max(env(safe-area-inset-top),16px)] left-4 z-40 ${
          readMode ? 'pointer-events-none' : ''
        }`}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={listOpen}
          aria-controls={navId}
          aria-label={
            current ? `Choose a country, currently showing ${current.name}` : 'Choose a country'
          }
          className="flex max-w-[60vw] items-center gap-2 rounded-full border border-aurora/70 bg-void/85 px-3.5 py-2.5 text-small font-medium text-fg-1 focus-ring backdrop-blur-md transition-colors"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {current ? flagEmoji(current.code) : '🌐'}
          </span>
          <span className="min-w-0 truncate">{current ? current.name : 'Countries'}</span>
          <span
            aria-hidden="true"
            className={`text-fg-3 transition-transform ${listOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>

        <nav
          id={navId}
          aria-label="Countries"
          hidden={!listOpen}
          className="absolute top-[calc(100%+8px)] left-0 flex max-h-[58vh] w-[min(86vw,360px)] flex-col overflow-hidden rounded-2xl border border-fg-1/10 bg-night/95 shadow-lg backdrop-blur-lg"
        >
          <div className="flex flex-none items-center justify-between border-b border-fg-1/10 px-3 py-2">
            <span className="text-[10px] font-medium tracking-wider text-fg-3 uppercase">
              Jump to a country
            </span>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Close country list"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-orbit text-xs leading-none text-fg-2 focus-ring [--focus-ring-offset:1px] hover:text-fg-1"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto p-2.5">
            {COUNTRIES_BY_REGION.map(({ region, countries }) => (
              <div key={region} role="group" aria-label={region} className="mt-3 first:mt-0">
                <p
                  aria-hidden="true"
                  className="px-1 pb-1.5 text-[10px] font-medium tracking-wider text-aurora uppercase"
                >
                  {region}
                </p>
                <ul className="flex flex-wrap content-start gap-1.5">
                  {countries.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.code, c.name)}
                        aria-current={c.code === currentCode ? 'true' : undefined}
                        className="inline-flex items-center gap-1.5 rounded-full border border-fg-1/15 bg-dusk px-2.5 py-1.5 text-[11px] text-fg-2 focus-ring transition-colors [--focus-ring-offset:1px] hover:border-fg-3 hover:text-fg-1 aria-[current=true]:border-aurora aria-[current=true]:bg-aurora/10 aria-[current=true]:text-fg-1"
                      >
                        <span aria-hidden="true" className="text-sm leading-none">
                          {flagEmoji(c.code)}
                        </span>
                        <span className="whitespace-nowrap">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}
