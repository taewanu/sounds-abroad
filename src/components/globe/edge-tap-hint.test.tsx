import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { globeChartStore } from "@/lib/globe-chart-store";

import { EdgeTapHint } from "./edge-tap-hint";

function renderHint(active = true) {
  return render(<EdgeTapHint active={active} snap="peek" />);
}

beforeEach(() => {
  localStorage.clear();
  globeChartStore.setState({ skipIntent: { dir: 1, nonce: 0 } });
});

afterEach(cleanup);

describe("EdgeTapHint", () => {
  test("shows the wordless skip cue only when active and unseen", () => {
    expect(renderHint(false).queryByTestId("edge-tap-badge")).toBeNull();
    cleanup();

    const { getByTestId } = renderHint(true);
    expect(getByTestId("edge-tap-badge").textContent).toMatch(
      /double-tap either edge to skip/i,
    );
    expect(getByTestId("edge-tap-backdrop")).toBeTruthy();
  });

  test("does not show again once the flag is already set", () => {
    localStorage.setItem("sounds-abroad:edge-tap-hint-seen:v1", "1");

    expect(renderHint(true).queryByTestId("edge-tap-badge")).toBeNull();
  });

  test("marks itself seen on show", () => {
    renderHint(true);

    expect(localStorage.getItem("sounds-abroad:edge-tap-hint-seen:v1")).toBe(
      "1",
    );
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
