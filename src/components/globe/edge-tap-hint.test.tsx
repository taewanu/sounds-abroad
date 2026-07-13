import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { globeChartStore } from "@/lib/globe-chart-store";

import { readRecord, writeRecord } from "./edge-hint-record";
import { EdgeTapHint } from "./edge-tap-hint";

function renderHint(active = true) {
  return render(<EdgeTapHint active={active} snap="peek" />);
}

function stubPointer(coarse: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("coarse") ? coarse : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  globeChartStore.setState({ skipIntent: { dir: 1, nonce: 0 } });
  stubPointer(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EdgeTapHint", () => {
  test("shows the wordless skip cue only when active and scheduled", () => {
    expect(renderHint(false).queryByTestId("edge-tap-badge")).toBeNull();
    cleanup();

    const { getByTestId } = renderHint(true);
    expect(getByTestId("edge-tap-badge").textContent).toMatch(
      /double-tap either edge to skip/i,
    );
    expect(getByTestId("edge-tap-backdrop")).toBeTruthy();
  });

  test("stays hidden on a fine pointer, where the buttons are the skip path", () => {
    stubPointer(false);

    expect(renderHint(true).queryByTestId("edge-tap-badge")).toBeNull();
  });

  test("does not consume a scheduled show on a fine pointer", () => {
    stubPointer(false);

    renderHint(true);

    expect(readRecord()).toEqual({ shows: 0, used: false });
  });

  test("does not show once the gesture has been used", () => {
    writeRecord({ shows: 0, used: true });

    expect(renderHint(true).queryByTestId("edge-tap-badge")).toBeNull();
  });

  test("shows again on a later visit while under the show cap", () => {
    writeRecord({ shows: 2, used: false });

    expect(renderHint(true).queryByTestId("edge-tap-badge")).toBeTruthy();
  });

  test("stops for good at the show cap even when never used", () => {
    writeRecord({ shows: 3, used: false });

    expect(renderHint(true).queryByTestId("edge-tap-badge")).toBeNull();
  });

  test("records the appearance on show without latching used", () => {
    renderHint(true);

    expect(readRecord()).toEqual({ shows: 1, used: false });
  });

  test("counts one appearance per visit even when the cue toggles away and back", () => {
    const { rerender } = renderHint(true);

    rerender(<EdgeTapHint active={false} snap="peek" />);
    rerender(<EdgeTapHint active={true} snap="peek" />);

    expect(readRecord().shows).toBe(1);
  });

  test("dismisses when the user performs a real skip", () => {
    const { queryByTestId } = renderHint(true);
    expect(queryByTestId("edge-tap-badge")).toBeTruthy();

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    expect(queryByTestId("edge-tap-badge")).toBeNull();
  });

  test("retires on the fallback timeout when no skip comes", () => {
    vi.useFakeTimers();
    try {
      const { queryByTestId } = renderHint(true);
      expect(queryByTestId("edge-tap-badge")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(queryByTestId("edge-tap-badge")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("renders the reskinned chrome, not the old chip-and-caption cue", () => {
    const { container, getByTestId } = renderHint(true);

    // The aurora rails are the new language; the old fade-in chip row is gone.
    expect(container.querySelectorAll(".tour-rail")).toHaveLength(2);
    expect(container.querySelector(".tour-fade")).toBeNull();
    // The left edge echoes the double-tap so "either edge" is shown, not worded.
    expect(getByTestId("edge-tap-echo")).toBeTruthy();
    // Pointer-transparent so it never intercepts the taps it teaches.
    expect(getByTestId("edge-tap-backdrop").className).toContain(
      "pointer-events-none",
    );
    expect(getByTestId("edge-tap-foreground").className).toContain(
      "pointer-events-none",
    );
  });
});
