import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COUNTRY_KR, COUNTRY_US } from "@/lib/__fixtures__";
import type { AudioEngine } from "@/lib/audio-engine";
import { createAudioStore } from "@/lib/audio-store";
import type { Country } from "@/lib/chart-schema";
import { selectGem } from "@/lib/select-gem";
import {
  AudioStoreContext,
  AudioStoreProvider,
} from "@/providers/audio-store-provider";

import { ChartSheet, type SnapState } from "./sheet";

function makeMockAudio(): AudioEngine {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// The scroll is deferred by rAF: one frame to let the DOM catch up, a second
// when the list remounted onto a new country.
async function frames(count: number) {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

function setScrollTop(el: Element, value: number) {
  Object.defineProperty(el, "scrollTop", { value, configurable: true });
}

const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

// jsdom has no layout, so reveal-only's visibility check reads all-zero rects.
// Stub the vertical bounds the check compares: the <ol> is the viewport, and any
// row is placed relative to it to force the fully-visible / clipped branch.
function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubRects(viewport: DOMRect, row: DOMRect) {
  Element.prototype.getBoundingClientRect = function () {
    if (this.tagName === "OL") return viewport;
    if (this.hasAttribute("data-rank")) return row;
    return rect(0, 0);
  };
}

function renderSheet(snap: SnapState) {
  const onSnapChange = vi.fn();
  const store = createAudioStore(() => makeMockAudio());
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <ChartSheet
        country={COUNTRY_KR}
        countryCode="kr"
        snap={snap}
        onSnapChange={onSnapChange}
      />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, onSnapChange, store };
}

// Drag the body with a mouse pointer: press, cross the threshold, drag, release.
// The first move both crosses the threshold and baselines the drag at that
// point, so a second move supplies the actual travel.
function dragBody(target: Element, fromY: number, toY: number) {
  fireEvent.pointerDown(target, { clientY: fromY, pointerType: "mouse" });
  fireEvent.pointerMove(window, { clientY: fromY + (toY > fromY ? 6 : -6) });
  fireEvent.pointerMove(window, { clientY: toY });
  fireEvent.pointerUp(window);
}

// The touch handlers are attached natively (non-passive), so dispatch raw touch
// events. jsdom models neither native scroll nor layout, but the hand-off branch
// (list at scrollTop <= 0 while still pulling down) is plain logic: scrollTop is
// mocked via setScrollTop and height falls back to window.innerHeight. The real
// scroll and the gesture feel are device-verified.
function dispatchTouch(target: Element, type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: [{ clientY }],
    configurable: true,
  });
  target.dispatchEvent(event);
}

describe("ChartSheet", () => {
  test("renders each track in the country", () => {
    renderSheet("peek");

    // getAllByText, not getByText: the gem card duplicates one track's name
    // and artist above the ranked list, so that track's text renders twice.
    for (const track of COUNTRY_KR.tracks) {
      expect(screen.getAllByText(track.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(track.artist).length).toBeGreaterThan(0);
    }
  });

  test("renders the country name as the sheet title", () => {
    renderSheet("peek");

    expect(screen.getByText(COUNTRY_KR.name)).toBeDefined();
  });

  test("labels the sheet region with its title", () => {
    renderSheet("peek");

    const sheet = screen.getByTestId("chart-sheet");
    const labelId = sheet.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe(
      COUNTRY_KR.name,
    );
  });

  // The sheet must not autofocus its own controls on mount, and Tab off the
  // last control must escape the sheet rather than wrap back into it. Both
  // regress if the sheet is ever rewrapped in a focus-trapping Dialog.
  test("does not steal focus into the sheet on mount", () => {
    renderSheet("peek");

    expect(document.activeElement).toBe(document.body);
  });

  test("does not trap Tab: a Tab keydown on the last control is not intercepted", () => {
    renderSheet("full");
    const sheet = screen.getByTestId("chart-sheet");
    const tabbables = sheet.querySelectorAll<HTMLElement>("button, a[href]");
    const last = tabbables[tabbables.length - 1];

    // fireEvent returns false when a handler called preventDefault on the
    // cancelable event; a trapping FocusScope would cancel the wrap here.
    const notPrevented = fireEvent.keyDown(last, { key: "Tab" });

    expect(notPrevented).toBe(true);
  });

  test("collapses to closed on Escape", () => {
    const { onSnapChange } = renderSheet("full");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSnapChange).toHaveBeenCalledWith("closed");
  });

  test("ignores Escape when already collapsed off-screen", () => {
    const { onSnapChange } = renderSheet("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onSnapChange).not.toHaveBeenCalled();
  });

  test("leaves Escape to a focused form control instead of collapsing", () => {
    const { onSnapChange } = renderSheet("full");
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSnapChange).not.toHaveBeenCalled();
    input.remove();
  });

  test("renders the country's gem, matching what selectGem picks", () => {
    const selection = selectGem(COUNTRY_KR.tracks);
    if (!selection) throw new Error("fixture has tracks; expected a gem");

    renderSheet("peek");

    const region = screen.getByRole("region", { name: /today's gem/i });
    expect(region.textContent).toContain(selection.gem.name);
    expect(region.textContent).toContain(selection.tier);
  });

  test("one-tap play from the gem card plays it on the audio store", () => {
    const selection = selectGem(COUNTRY_KR.tracks);
    if (!selection) throw new Error("fixture has tracks; expected a gem");
    const gem = selection.gem;
    const { store } = renderSheet("peek");

    // Scoped to the region: the gem also renders as an ordinary row further
    // down the list, which has its own same-named play button.
    const region = screen.getByRole("region", { name: /today's gem/i });
    fireEvent.click(within(region).getByRole("button", { name: /play/i }));

    expect(store.getState().currentTrack).toEqual(gem);
    expect(store.getState().isPlaying).toBe(true);
  });

  test("renders no gem card, and doesn't throw, for a country with no tracks", () => {
    const emptyCountry: Country = { ...COUNTRY_KR, tracks: [] };
    const store = createAudioStore(() => makeMockAudio());

    expect(() =>
      render(
        <AudioStoreContext.Provider value={store}>
          <ChartSheet
            country={emptyCountry}
            countryCode="kr"
            snap="peek"
            onSnapChange={vi.fn()}
          />
        </AudioStoreContext.Provider>,
      ),
    ).not.toThrow();

    expect(screen.queryByRole("region", { name: /today's gem/i })).toBeNull();
  });

  test("exposes data-snap='peek' when snap prop is peek", () => {
    renderSheet("peek");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("peek");
  });

  test("exposes data-snap='full' when snap prop is full", () => {
    renderSheet("full");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("full");
  });

  test("exposes data-snap='closed' when snap prop is closed", () => {
    renderSheet("closed");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("closed");
  });

  test("exposes data-snap='hidden' when snap prop is hidden", () => {
    renderSheet("hidden");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("hidden");
  });

  test("fires onSnapChange with 'full' when handle clicked while peek", () => {
    const { onSnapChange } = renderSheet("peek");

    fireEvent.click(screen.getByRole("button", { name: /expand chart/i }));

    expect(onSnapChange).toHaveBeenCalledWith("full");
  });

  test("fires onSnapChange with 'peek' when handle clicked while full", () => {
    const { onSnapChange } = renderSheet("full");

    fireEvent.click(screen.getByRole("button", { name: /collapse chart/i }));

    expect(onSnapChange).toHaveBeenCalledWith("peek");
  });

  test("scrolls currentTrack into view when sheet transitions from closed", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[2].rank;
    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="closed"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("does not scroll when transitioning between peek and full", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[0].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="full"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("scrolls currentTrack into view when sheet transitions from hidden", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[2].rank;
    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="hidden"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("scrolls currentTrack into view when scrollSignal increments while open", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[0].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
          scrollSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("does not scroll on a direct tap: a rank change with no step", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // Off-screen row: a skip would pull it in, but a direct tap must not.
    stubRects(rect(0, 100), rect(200, 240));
    const first = COUNTRY_KR.tracks[0].rank;
    const other = COUNTRY_KR.tracks[2].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={first}
          stepSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    // A tap: the rank changes but the step signal does not.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={other}
          stepSignal={0}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("does not scroll when currentTrackRank is null", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="closed"
          onSnapChange={vi.fn()}
          currentTrackRank={null}
        />
      </AudioStoreProvider>,
    );

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={null}
        />
      </AudioStoreProvider>,
    );

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("scrolls the now-playing row into view on a skip while open when the row is off-screen", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // Row sits below the peek viewport, so reveal-only must pull it in.
    stubRects(rect(0, 100), rect(200, 240));
    const first = COUNTRY_KR.tracks[0].rank;
    const next = COUNTRY_KR.tracks[2].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={first}
          stepSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    // A skip: the rank changes and the step signal bumps.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={next}
          stepSignal={1}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("does not scroll when the playing country differs from the displayed country", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // Row would be off-screen, but the now-playing track belongs to another
    // country, so its rank must not scroll the browsed country's list.
    stubRects(rect(0, 100), rect(200, 240));
    const first = COUNTRY_KR.tracks[0].rank;
    const next = COUNTRY_KR.tracks[2].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={first}
          currentCountryCode="us"
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={next}
          currentCountryCode="us"
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("a reopen asked from another country scrolls on the first ask, once the displayed country catches up", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // A rank the browsed country also has, so a scroll during the mismatch would
    // land on its unrelated row.
    const rank = COUNTRY_KR.tracks[2].rank;
    const props = {
      snap: "peek" as const,
      onSnapChange: vi.fn(),
      currentTrackRank: rank,
      currentCountryCode: "kr",
    };

    // Browsing one country while another's track plays. The reopen bumps the
    // signal a render before the route swaps the displayed country over.
    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          {...props}
          country={COUNTRY_US}
          countryCode="us"
          scrollSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...props}
          country={COUNTRY_US}
          countryCode="us"
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...props}
          country={COUNTRY_KR}
          countryCode="kr"
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );
    // The swapped list takes the extra frame it waits for its layout on.
    await frames(2);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("a step that lands in another country reveals its row once the displayed country catches up", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // A roll lands deep in the new chart while its list remounts at the top, so
    // the row needs revealing rather than already sitting in view.
    stubRects(rect(0, 100), rect(200, 240));
    const landed = COUNTRY_KR.tracks[2].rank;
    const base = { snap: "peek" as const, onSnapChange: vi.fn() };

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_US}
          countryCode="us"
          currentTrackRank={COUNTRY_US.tracks[0].rank}
          currentCountryCode="us"
          stepSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    // The roll steps into another country's track a render before the route
    // swaps the displayed chart over.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_US}
          countryCode="us"
          currentTrackRank={landed}
          currentCountryCode="kr"
          stepSignal={1}
        />
      </AudioStoreProvider>,
    );
    await frames(2);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_KR}
          countryCode="kr"
          currentTrackRank={landed}
          currentCountryCode="kr"
          stepSignal={1}
        />
      </AudioStoreProvider>,
    );
    await frames(2);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("drops a held reopen ask once nothing is playing, rather than firing it at the next track", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // The row the user goes on to tap is off-screen, so only a stale reopen
    // surviving the silence could pull the list to it: a direct tap carries no
    // step, and so must never scroll on its own.
    stubRects(rect(0, 100), rect(200, 240));
    const rank = COUNTRY_KR.tracks[2].rank;
    const base = { snap: "peek" as const, onSnapChange: vi.fn() };

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_KR}
          countryCode="kr"
          currentTrackRank={COUNTRY_KR.tracks[0].rank}
          currentCountryCode="us"
          scrollSignal={0}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    // An ask raised while another country's track plays, so it goes unanswered.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_KR}
          countryCode="kr"
          currentTrackRank={COUNTRY_KR.tracks[0].rank}
          currentCountryCode="us"
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );

    // That track ends and the chart falls silent.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_KR}
          countryCode="kr"
          currentTrackRank={null}
          currentCountryCode={null}
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );

    // The user taps a row of the displayed country.
    rerender(
      <AudioStoreProvider>
        <ChartSheet
          {...base}
          country={COUNTRY_KR}
          countryCode="kr"
          currentTrackRank={rank}
          currentCountryCode="kr"
          scrollSignal={1}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("does not scroll when the track changes while open but the row is already fully visible", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    // Row sits inside the peek viewport, so reveal-only leaves the list put.
    stubRects(rect(0, 100), rect(10, 50));
    const first = COUNTRY_KR.tracks[0].rank;
    const next = COUNTRY_KR.tracks[2].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={first}
        />
      </AudioStoreProvider>,
    );
    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={next}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("expands to full when the body is dragged up from peek", () => {
    const { onSnapChange } = renderSheet("peek");

    dragBody(screen.getByTestId("chart-sheet"), 500, 150);

    expect(onSnapChange).toHaveBeenCalledWith("full");
  });

  test("collapses toward closed when the body is dragged down from peek", () => {
    const { onSnapChange } = renderSheet("peek");

    dragBody(screen.getByTestId("chart-sheet"), 500, 850);

    expect(onSnapChange).toHaveBeenCalledWith("closed");
  });

  test("yields to list scroll on pointer down when the list is scrolled", () => {
    const { onSnapChange } = renderSheet("peek");
    const list = screen.getByRole("list");
    setScrollTop(list, 40);

    fireEvent.pointerDown(list, { clientY: 500, pointerType: "mouse" });

    expect(onSnapChange).not.toHaveBeenCalled();
  });

  test("does not change snap on a tap below the drag threshold", () => {
    const { onSnapChange } = renderSheet("peek");

    fireEvent.pointerDown(screen.getByTestId("chart-sheet"), {
      clientY: 500,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(window);

    expect(onSnapChange).not.toHaveBeenCalled();
  });

  test("hands off to a collapse when the full list is dragged down from the top", () => {
    const { onSnapChange } = renderSheet("full");
    const list = screen.getByRole("list");
    setScrollTop(list, 0);

    dispatchTouch(list, "touchstart", 300);
    dispatchTouch(list, "touchmove", 340);
    dispatchTouch(list, "touchmove", 700);
    dispatchTouch(list, "touchend", 700);

    expect(onSnapChange).toHaveBeenCalledWith("peek");
  });

  test("does not hand off while the full list is still scrolled", () => {
    const { onSnapChange } = renderSheet("full");
    const list = screen.getByRole("list");
    setScrollTop(list, 80);

    dispatchTouch(list, "touchstart", 300);
    dispatchTouch(list, "touchmove", 340);
    dispatchTouch(list, "touchend", 340);

    expect(onSnapChange).not.toHaveBeenCalled();
  });
});

describe("ChartSheet commentary focus", () => {
  // The focus-mode teasers carry data-commentary-teaser; the gem card's accordion
  // does not, so this selects a ranked row's commentary teaser.
  function firstTeaser(container: HTMLElement) {
    return container.querySelector<HTMLButtonElement>(
      "[data-commentary-teaser]",
    );
  }

  test("opening a teaser focuses its card and dims the other rows", () => {
    const { container } = renderSheet("full");
    const teaser = firstTeaser(container);
    expect(teaser).not.toBeNull();

    fireEvent.click(teaser!);

    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();
    expect(
      container.querySelector("li[class*='pointer-events-none']"),
    ).not.toBeNull();
  });

  test("the commentary badge toggles: a repeat focus ask for the open row closes it", () => {
    const store = createAudioStore(() => makeMockAudio());
    const rank = COUNTRY_KR.tracks[0].rank;
    const view = (nonce: number) => (
      <AudioStoreContext.Provider value={store}>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode="kr"
          snap="full"
          onSnapChange={vi.fn()}
          focusIntent={{ rank, nonce }}
        />
      </AudioStoreContext.Provider>
    );

    const { container, rerender } = render(view(1));
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();

    // The same badge pressed again: a fresh nonce for the open row closes it.
    rerender(view(2));
    expect(container.querySelector("[data-commentary-card]")).toBeNull();

    // Pressed once more: it opens again.
    rerender(view(3));
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();
  });

  test("dimmed siblings and the gem card recede and go inert", () => {
    const { container } = renderSheet("full");
    fireEvent.click(firstTeaser(container)!);

    const sibling = container.querySelector(
      "li[data-rank]:not([data-commentary-card])",
    );
    expect(sibling?.hasAttribute("inert")).toBe(true);

    // The gem card is the one ranked-list <li> without a data-rank.
    const gemLi = container.querySelector("ol > li:not([data-rank])");
    expect(gemLi?.className).toContain("opacity-40");
    expect(gemLi?.hasAttribute("inert")).toBe(true);
  });

  test("Escape closes the focused card without collapsing the sheet", () => {
    const { container, onSnapChange } = renderSheet("full");
    fireEvent.click(firstTeaser(container)!);
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.querySelector("[data-commentary-card]")).toBeNull();
    // The card owns the first Escape; the sheet-collapse handler stands down.
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  test("a second Escape, after the card closes, collapses the sheet", () => {
    const { container, onSnapChange } = renderSheet("full");
    fireEvent.click(firstTeaser(container)!);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSnapChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSnapChange).toHaveBeenCalledWith("closed");
  });

  test("a click on the sheet outside the card (a dimmed sibling) closes it", () => {
    const { container } = renderSheet("full");
    fireEvent.click(firstTeaser(container)!);
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();

    const sibling = container.querySelector(
      "li[data-rank]:not([data-commentary-card])",
    );
    fireEvent.click(sibling!);

    expect(container.querySelector("[data-commentary-card]")).toBeNull();
  });

  test("a click outside the sheet (persistent chrome) keeps the card open", () => {
    const { container } = renderSheet("full");
    fireEvent.click(firstTeaser(container)!);
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();

    // The mini-player and other chrome live outside the sheet element; clicking
    // them must not collapse the card.
    fireEvent.click(document.body);

    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();
  });

  test("switching country closes the card and does not restore it on return", () => {
    const store = createAudioStore(() => makeMockAudio());
    const view = (cc: string) => (
      <AudioStoreContext.Provider value={store}>
        <ChartSheet
          country={COUNTRY_KR}
          countryCode={cc}
          snap="full"
          onSnapChange={vi.fn()}
        />
      </AudioStoreContext.Provider>
    );
    const { container, rerender } = render(view("kr"));
    fireEvent.click(firstTeaser(container)!);
    expect(container.querySelector("[data-commentary-card]")).not.toBeNull();

    rerender(view("us"));
    rerender(view("kr"));

    expect(container.querySelector("[data-commentary-card]")).toBeNull();
  });
});
