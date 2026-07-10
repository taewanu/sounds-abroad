import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SnapState } from "@/components/chart-sheet/sheet";
import { globeChartStore } from "@/lib/globe-chart-store";
import { tourBridge } from "@/lib/tour-bridge";

import { TourHost, type TourHostProps } from "./tour-host";
import type { TourRecord } from "./tour-record";
import { readRecord, writeRecord } from "./tour-record-store";

function stubMatchMedia(reduced: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("reduce") ? reduced : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function seedRecord(record: TourRecord) {
  writeRecord(record);
}

function renderHost(overrides: Partial<TourHostProps> = {}) {
  const props: TourHostProps = {
    snap: "peek" as SnapState,
    currentTrackKey: null,
    selectedCode: "us",
    ...overrides,
  };
  const utils = render(<TourHost {...props} />);
  const rerenderWith = (next: Partial<TourHostProps>) =>
    utils.rerender(<TourHost {...props} {...next} />);
  return { ...utils, rerenderWith };
}

function makeGlobeReady() {
  act(() => {
    tourBridge.getState().setGlobeReady(true);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  globeChartStore.setState({ lastSettleViaTap: false });
  act(() => {
    tourBridge.getState().setGlobeReady(false);
    tourBridge.getState().setTourActive(false);
  });
});

describe("TourHost", () => {
  test("stays hidden for a user who dismissed the tour, even once the globe is ready", () => {
    stubMatchMedia(false);
    seedRecord({ learned: [], shows: 1, dismissed: true });

    const { queryByTestId } = renderHost();
    makeGlobeReady();

    expect(queryByTestId("tour-overlay")).toBeNull();
  });

  test("stays hidden once the appearance cap is reached", () => {
    stubMatchMedia(false);
    seedRecord({ learned: ["gesture"], shows: 2, dismissed: false });

    const { queryByTestId } = renderHost();
    makeGlobeReady();

    expect(queryByTestId("tour-overlay")).toBeNull();
  });

  test("stays hidden until the globe is ready", () => {
    stubMatchMedia(false);

    const { queryByTestId } = renderHost();

    expect(queryByTestId("tour-overlay")).toBeNull();
  });

  test("opens on the gesture beat with the flick hint and its badge", () => {
    stubMatchMedia(false);

    const { getByTestId } = renderHost();
    makeGlobeReady();

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe(
      "gesture",
    );
    expect(getByTestId("tour-flick-hint")).toBeTruthy();
    const badge = getByTestId("tour-badge");
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.textContent).toMatch(/flick to spin/i);
  });

  test("re-teaches only the un-learned beats, opening on the first of them", () => {
    stubMatchMedia(false);
    seedRecord({ learned: ["gesture"], shows: 1, dismissed: false });

    const { getByTestId } = renderHost();
    makeGlobeReady();

    // The gesture is already learned, so the tour opens on the sheet beat.
    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("sheet");
  });

  test("the user's first selection advances to the sheet beat", () => {
    stubMatchMedia(false);
    const { getByTestId, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("sheet");
  });

  test("a bare globe tap-select does not skip the gesture beat", () => {
    stubMatchMedia(false);
    const { getByTestId, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      // The country changed, but the settle came from a tap, not the flick.
      globeChartStore.getState().signalSettle(true);
      rerenderWith({ selectedCode: "jp" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe(
      "gesture",
    );
  });

  test("the X control ends the tour and latches dismissed permanently", () => {
    stubMatchMedia(false);
    const { getByRole, queryByTestId } = renderHost();
    makeGlobeReady();

    fireEvent.click(getByRole("button", { name: "Dismiss tour" }));

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(readRecord().dismissed).toBe(true);
  });

  test("Escape dismisses the tour and latches dismissed permanently", () => {
    stubMatchMedia(false);
    const { queryByTestId } = renderHost();
    makeGlobeReady();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(readRecord().dismissed).toBe(true);
  });

  test("advances to the audio beat when the sheet is pulled to full", () => {
    stubMatchMedia(false);
    const { getByTestId, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("audio");
  });

  test("completes and records every beat as learned when a track previews", () => {
    stubMatchMedia(false);
    const { queryByTestId, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full" });
    });
    act(() => {
      rerenderWith({
        selectedCode: "jp",
        snap: "full",
        currentTrackKey: "kr-1",
      });
    });

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(readRecord().learned).toEqual(["gesture", "sheet", "audio"]);
  });

  test("a track already previewing when the audio beat opens does not skip it", () => {
    stubMatchMedia(false);
    // A track was played earlier (e.g. an accidental tap during beats 1-2).
    const { getByTestId, rerenderWith } = renderHost({
      currentTrackKey: "pre",
    });
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp", currentTrackKey: "pre" });
    });
    act(() => {
      rerenderWith({
        selectedCode: "jp",
        snap: "full",
        currentTrackKey: "pre",
      });
    });

    // The audio beat baselines the already-playing track, so it keeps teaching
    // rather than auto-completing on a preview from before the beat.
    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("audio");
  });

  test("keeps the badge and its accessible text under reduced motion", () => {
    stubMatchMedia(true);
    const { getByTestId } = renderHost();
    makeGlobeReady();

    // The badge stays mounted as the wordless tour's a11y fallback. The breathe
    // and hand animations are suppressed by a CSS media query, which jsdom does
    // not evaluate, so that suppression is device-verified, not asserted here.
    const badge = getByTestId("tour-badge");
    expect(badge.getAttribute("aria-hidden")).toBeNull();
    expect(badge.textContent).toMatch(/flick to spin/i);
  });

  test("withholds the track spotlight until the sheet finishes rising", () => {
    stubMatchMedia(false);
    const sheet = document.createElement("div");
    sheet.setAttribute("data-testid", "chart-sheet");
    sheet.innerHTML = '<ol><li data-rank="1">track</li></ol>';
    document.body.appendChild(sheet);

    const { getByTestId, queryByTestId, rerenderWith } = renderHost();
    makeGlobeReady();
    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("audio");
    expect(queryByTestId("tour-tap-hint")).toBeNull();

    act(() => {
      const settle = new Event("transitionend", { bubbles: true });
      Object.defineProperty(settle, "propertyName", { value: "transform" });
      sheet.dispatchEvent(settle);
    });

    expect(queryByTestId("tour-tap-hint")).toBeTruthy();

    document.body.removeChild(sheet);
  });

  test("hides the flick hand on a globe grab, then re-arms it on a no-op settle", () => {
    stubMatchMedia(false);
    const { getByTestId, queryByTestId } = renderHost();
    makeGlobeReady();

    expect(getByTestId("tour-flick-hint")).toBeTruthy();

    act(() => {
      fireEvent.pointerDown(document.body);
    });

    expect(queryByTestId("tour-flick-hint")).toBeNull();
    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe(
      "gesture",
    );

    act(() => {
      globeChartStore.getState().signalSettle();
    });

    expect(queryByTestId("tour-flick-hint")).toBeTruthy();
  });

  test("a tap on the chart sheet does not hide the flick hand", () => {
    stubMatchMedia(false);
    const sheet = document.createElement("div");
    sheet.setAttribute("data-testid", "chart-sheet");
    document.body.appendChild(sheet);

    const { getByTestId } = renderHost();
    makeGlobeReady();

    expect(getByTestId("tour-flick-hint")).toBeTruthy();

    act(() => {
      fireEvent.pointerDown(sheet);
    });

    expect(getByTestId("tour-flick-hint")).toBeTruthy();

    document.body.removeChild(sheet);
  });
});
