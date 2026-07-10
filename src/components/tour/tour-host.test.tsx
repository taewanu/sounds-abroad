import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SnapState } from "@/components/chart-sheet/sheet";
import { globeChartStore } from "@/lib/globe-chart-store";
import { tourBridge } from "@/lib/tour-bridge";

import { TourHost, type TourHostProps } from "./tour-host";

const KEY = "sounds-abroad:tour-seen:v1";

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

function renderHost(overrides: Partial<TourHostProps> = {}) {
  const props: TourHostProps = {
    snap: "peek" as SnapState,
    currentTrackId: null,
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
  });
});

describe("TourHost", () => {
  test("stays hidden for a returning user even once the globe is ready", () => {
    stubMatchMedia(false);
    localStorage.setItem(KEY, "1");

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

  test("the X control ends the tour and records it as seen", () => {
    stubMatchMedia(false);
    const { getByRole, queryByTestId } = renderHost();
    makeGlobeReady();

    fireEvent.click(getByRole("button", { name: "Dismiss tour" }));

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  test("Escape dismisses the tour and records it as seen", () => {
    stubMatchMedia(false);
    const { queryByTestId } = renderHost();
    makeGlobeReady();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
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

  test("completes and records as seen when a track previews on the audio beat", () => {
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
        currentTrackId: "kr-1",
      });
    });

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  test("a track already previewing when the audio beat opens does not skip it", () => {
    stubMatchMedia(false);
    // A track was played earlier (e.g. an accidental tap during beats 1-2).
    const { getByTestId, rerenderWith } = renderHost({ currentTrackId: "pre" });
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp", currentTrackId: "pre" });
    });
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full", currentTrackId: "pre" });
    });

    // The audio beat baselines the already-playing track, so it keeps teaching
    // rather than auto-completing on a preview from before the beat.
    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("audio");
  });

  test("mounts the badge without an inline animation under reduced motion", () => {
    stubMatchMedia(true);
    const { getByTestId } = renderHost();
    makeGlobeReady();

    const badge = getByTestId("tour-badge");
    expect(badge).toBeTruthy();
    expect(badge.style.animation).toBe("");
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
