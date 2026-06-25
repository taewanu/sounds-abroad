"use client";

import { useEffect, useId, useRef, useState } from "react";

import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/country-code";
import { globeChartStore, useGlobeChart } from "@/lib/globe-chart-store";

// Group the grid by continent, west-to-east so it mirrors the globe's eastward
// spin; alphabetical within each region.
const REGION_ORDER = [
  "Americas",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
] as const;

const COUNTRIES_BY_REGION = REGION_ORDER.map((region) => ({
  region,
  countries: COUNTRIES.filter((c) => c.region === region).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  ),
}));

// ISO 3166-1 alpha-2 → regional-indicator flag emoji. Decorative only (the
// country name carries the meaning); degrades to the letter pair on platforms
// without flag glyphs (e.g. Windows).
function flagEmoji(code: string): string {
  const offset = 0x1f1e6 - "a".charCodeAt(0);
  return String.fromCodePoint(
    code.charCodeAt(0) + offset,
    code.charCodeAt(1) + offset,
  );
}

// A keyboard- and screen-reader-first way to pick a country, equal to the globe
// gesture: a labeled landmark of named country buttons. A pick drives the globe
// through the globe-chart store; the grid stays open so you can keep hopping.
export function CountrySelector() {
  // The selected country comes from the store, not useSearchParams: this badge
  // is a layout backdrop, where that hook is frozen to its first value and
  // never sees a client-side ?cc= change. The chart publishes the resolved
  // country to the store; the globe and this badge read it from there.
  const currentCode = useGlobeChart((s) => s.selectedCountry);
  const current = currentCode ? countryByCode(currentCode) : null;

  // At sheet full the chart's grip and title sit where this badge floats, so
  // recede it, the same rule that suspends the globe spin. The seam is the
  // store, not the sheet tree, so the selector stays decoupled from the sheet.
  const readMode = useGlobeChart((s) => s.readMode);

  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
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
    // Same channels the gesture uses: the store reaches the layout globe (whose
    // useSearchParams can't see this), replaceState keeps the shareable URL in
    // step without flooding history. Stay open so the grid is still there.
    globeChartStore.getState().setSelectedCountry(code);
    window.history.replaceState(null, "", `?cc=${code}`);
    setAnnouncement(`Now showing ${name}`);
  };

  // Escape closes and returns focus to the toggle, the one focus move a
  // disclosure needs. (No focus trap; tab order alone walks in and out.)
  useEffect(() => {
    if (!listOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listOpen]);

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
          transform: "translateY(calc(var(--sheet-cover, 0) * -64px))",
          opacity: "calc(1 - var(--sheet-cover, 0))",
        }}
        className={`fixed top-[max(env(safe-area-inset-top),16px)] left-4 z-40 ${
          readMode ? "pointer-events-none" : ""
        }`}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={listOpen}
          aria-controls={navId}
          aria-label={
            current
              ? `Choose a country, currently showing ${current.name}`
              : "Choose a country"
          }
          className="bg-void/70 border-aurora/40 text-fg-1 text-small focus-visible:outline-aurora flex max-w-[60vw] items-center gap-2 rounded-full border px-3.5 py-2.5 font-medium backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true" className="text-base leading-none">
            {current ? flagEmoji(current.code) : "🌐"}
          </span>
          <span className="min-w-0 truncate">
            {current ? current.name : "Countries"}
          </span>
          <span
            aria-hidden="true"
            className={`text-fg-3 transition-transform duration-200 ${
              listOpen ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        <nav
          id={navId}
          aria-label="Countries"
          hidden={!listOpen}
          className="bg-night/95 border-fg-1/10 absolute top-[calc(100%+8px)] left-0 flex max-h-[58vh] w-[min(86vw,360px)] flex-col overflow-hidden rounded-2xl border shadow-lg backdrop-blur-lg"
        >
          <div className="border-fg-1/10 flex flex-none items-center justify-between border-b px-3 py-2">
            <span className="text-fg-3 text-[10px] font-medium tracking-wider uppercase">
              Jump to a country
            </span>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Close country list"
              className="bg-orbit text-fg-2 hover:text-fg-1 focus-visible:outline-aurora flex h-6 w-6 items-center justify-center rounded-full text-xs leading-none focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto p-2.5">
            {COUNTRIES_BY_REGION.map(({ region, countries }) => (
              <div
                key={region}
                role="group"
                aria-label={region}
                className="mt-3 first:mt-0"
              >
                <p
                  aria-hidden="true"
                  className="text-aurora px-1 pb-1.5 text-[10px] font-medium tracking-wider uppercase"
                >
                  {region}
                </p>
                <ul className="flex flex-wrap content-start gap-1.5">
                  {countries.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.code, c.name)}
                        aria-current={
                          c.code === currentCode ? "true" : undefined
                        }
                        className="border-fg-1/15 bg-dusk text-fg-2 hover:text-fg-1 hover:border-fg-3 focus-visible:outline-aurora aria-[current=true]:border-aurora aria-[current=true]:bg-aurora/10 aria-[current=true]:text-fg-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
                      >
                        <span
                          aria-hidden="true"
                          className="text-sm leading-none"
                        >
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
