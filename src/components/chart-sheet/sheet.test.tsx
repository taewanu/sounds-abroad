import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COUNTRY_KR } from "@/lib/__fixtures__";
import { AudioStoreProvider } from "@/providers/audio-store-provider";

import { ChartSheet, type SnapState } from "./sheet";

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
  const utils = render(
    <AudioStoreProvider>
      <ChartSheet
        country={COUNTRY_KR}
        countryCode="kr"
        snap={snap}
        onSnapChange={onSnapChange}
      />
    </AudioStoreProvider>,
  );
  return { ...utils, onSnapChange };
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

    for (const track of COUNTRY_KR.tracks) {
      expect(screen.getByText(track.name)).toBeDefined();
      expect(screen.getByText(track.artist)).toBeDefined();
    }
  });

  test("renders the country name as the dialog title", () => {
    renderSheet("peek");

    expect(screen.getByText(COUNTRY_KR.name)).toBeDefined();
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

  test("scrolls the now-playing row into view when the track changes while open and the row is off-screen", async () => {
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
