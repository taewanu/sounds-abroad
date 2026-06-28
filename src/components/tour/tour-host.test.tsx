import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SnapState } from "@/components/chart-sheet/sheet";
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
    hasCurrentTrack: false,
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

  test("opens on the gesture beat inviting a flick, with no Next yet", () => {
    stubMatchMedia(false);

    const { getByTestId, getByText, queryByRole } = renderHost();
    makeGlobeReady();

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe(
      "gesture",
    );
    expect(getByText(/flick the globe/i)).toBeTruthy();
    expect(getByTestId("tour-flick-hint")).toBeTruthy();
    expect(queryByRole("button", { name: "Next" })).toBeNull();
  });

  test("the user's first selection reveals Next without leaving the gesture beat", () => {
    stubMatchMedia(false);
    const { getByTestId, getByRole, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe(
      "gesture",
    );
    expect(getByRole("button", { name: "Next" })).toBeTruthy();
  });

  test("Next advances to the sheet beat once the user has flicked", () => {
    stubMatchMedia(false);
    const { getByTestId, getByRole, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    fireEvent.click(getByRole("button", { name: "Next" }));

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("sheet");
  });

  test("Skip ends the tour and records it as seen", () => {
    stubMatchMedia(false);
    const { getByRole, queryByTestId } = renderHost();
    makeGlobeReady();

    fireEvent.click(getByRole("button", { name: "Skip tour" }));

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
    const { getByTestId, getByRole, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    fireEvent.click(getByRole("button", { name: "Next" }));
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full" });
    });

    expect(getByTestId("tour-overlay").getAttribute("data-beat")).toBe("audio");
  });

  test("completes and records as seen when a track previews on the audio beat", () => {
    stubMatchMedia(false);
    const { getByRole, queryByTestId, rerenderWith } = renderHost();
    makeGlobeReady();

    act(() => {
      rerenderWith({ selectedCode: "jp" });
    });
    fireEvent.click(getByRole("button", { name: "Next" }));
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full" });
    });
    act(() => {
      rerenderWith({ selectedCode: "jp", snap: "full", hasCurrentTrack: true });
    });

    expect(queryByTestId("tour-overlay")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
  });
});
