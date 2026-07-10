import { cleanup, fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { TourOverlay, type TourOverlayProps } from "./tour-overlay";

function renderOverlay(overrides: Partial<TourOverlayProps> = {}) {
  const props: TourOverlayProps = {
    beat: "gesture",
    spotlight: null,
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
  test("names the beat's gesture in a politely-announced badge", () => {
    const { getByTestId } = renderOverlay({ beat: "gesture" });

    const badge = getByTestId("tour-badge");
    expect(badge.textContent).toMatch(/flick to spin/i);
    // The badge is the wordless look's a11y fallback, so it stays in the tree.
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.getAttribute("aria-live")).toBe("polite");
    expect(badge.getAttribute("aria-hidden")).toBeNull();
  });

  test("labels each later beat's gesture", () => {
    expect(
      renderOverlay({ beat: "sheet" }).getByTestId("tour-badge").textContent,
    ).toMatch(/pull up the chart/i);
    cleanup();
    expect(
      renderOverlay({ beat: "audio" }).getByTestId("tour-badge").textContent,
    ).toMatch(/tap a track/i);
  });

  test("renders no text callout card or dialog", () => {
    const { queryByTestId, queryByRole } = renderOverlay({ beat: "sheet" });

    expect(queryByTestId("tour-callout")).toBeNull();
    expect(queryByRole("dialog")).toBeNull();
  });

  test("shows the flick hint on the gesture beat and drops it once grabbed", () => {
    expect(renderOverlay().queryByTestId("tour-flick-hint")).toBeTruthy();
    cleanup();
    expect(
      renderOverlay({ hideFlickHint: true }).queryByTestId("tour-flick-hint"),
    ).toBeNull();
  });

  test("dismisses the tour from the X control", () => {
    const { props, getByRole } = renderOverlay();

    fireEvent.click(getByRole("button", { name: "Dismiss tour" }));

    expect(props.onSkip).toHaveBeenCalledOnce();
  });

  test("draws no scrim cutout when there is no spotlight", () => {
    const { queryByTestId } = renderOverlay({ spotlight: null });

    expect(queryByTestId("tour-scrim")).toBeNull();
  });

  test("frames the spotlight with four dim strips that never block", () => {
    const { getByTestId } = renderOverlay({ beat: "sheet", spotlight: rect() });

    const scrim = getByTestId("tour-scrim");
    // Four dim strips plus the aurora halo frame the cutout.
    expect(scrim.children.length).toBe(5);
    const strip = scrim.firstElementChild as HTMLElement;
    // The dim is visual only; it must not capture pointer events, so every
    // gesture reaches the live target under it.
    expect(strip.className).not.toContain("pointer-events-auto");
  });

  test("captures pointer events only on the X control", () => {
    const { getByTestId, getByRole } = renderOverlay({ beat: "sheet" });

    expect(getByTestId("tour-overlay").style.pointerEvents).toBe("none");
    expect(getByRole("button", { name: "Dismiss tour" }).className).toContain(
      "pointer-events-auto",
    );
  });
});
