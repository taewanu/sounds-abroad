import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { TourOverlay, type TourOverlayProps } from "./tour-overlay";

function renderOverlay(overrides: Partial<TourOverlayProps> = {}) {
  const props: TourOverlayProps = {
    beat: "gesture",
    gesturePhase: "ready",
    spotlight: null,
    passThrough: true,
    isLastBeat: false,
    onNext: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<TourOverlay {...props} />) };
}

const rect = (over: Partial<DOMRect> = {}): DOMRect =>
  ({
    top: 100,
    left: 40,
    right: 240,
    bottom: 180,
    width: 200,
    height: 80,
    ...over,
  }) as DOMRect;

describe("TourOverlay", () => {
  test("invites the user to flick and shows the hint on the try phase", () => {
    const { getByText, getByTestId, queryByRole } = renderOverlay({
      gesturePhase: "try",
    });

    expect(getByText(/flick the globe/i)).toBeTruthy();
    expect(getByText(/pick one from the list/i)).toBeTruthy();
    expect(getByTestId("tour-flick-hint")).toBeTruthy();
    // Next is withheld until the user has flicked, so they aren't rushed past it.
    expect(queryByRole("button", { name: "Next" })).toBeNull();
  });

  test("reveals Next and drops the hint once the user has flicked", () => {
    const { getByRole, queryByTestId } = renderOverlay({
      gesturePhase: "ready",
    });

    expect(getByRole("button", { name: "Next" })).toBeTruthy();
    expect(queryByTestId("tour-flick-hint")).toBeNull();
  });

  test("labels the primary button Done on the last beat", () => {
    const { getByRole } = renderOverlay({ beat: "audio", isLastBeat: true });

    expect(getByRole("button", { name: "Done" })).toBeTruthy();
  });

  test("fires onNext and onSkip from the two buttons", () => {
    const { props, getByRole } = renderOverlay();

    fireEvent.click(getByRole("button", { name: "Next" }));
    fireEvent.click(getByRole("button", { name: "Skip tour" }));

    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onSkip).toHaveBeenCalledOnce();
  });

  test("exposes the callout as a non-modal dialog", () => {
    const { getByRole } = renderOverlay();

    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("App tour");
    expect(dialog.getAttribute("aria-modal")).toBe("false");
  });

  test("draws no scrim cutout when there is no spotlight", () => {
    const { queryByTestId } = renderOverlay({ spotlight: null });

    expect(queryByTestId("tour-scrim")).toBeNull();
  });

  test("frames the spotlight and lets it capture pointer events when not passing through", () => {
    const { getByTestId } = renderOverlay({
      beat: "sheet",
      spotlight: rect(),
      passThrough: false,
    });

    const scrim = getByTestId("tour-scrim");
    expect(scrim.children.length).toBe(5);
    expect(scrim.firstElementChild?.className).toContain("pointer-events-auto");
  });

  test("lets the scrim pass pointer events through on the gesture beat", () => {
    const { getByTestId } = renderOverlay({
      spotlight: rect(),
      passThrough: true,
    });

    expect(getByTestId("tour-scrim").firstElementChild?.className).toContain(
      "pointer-events-none",
    );
  });
});
