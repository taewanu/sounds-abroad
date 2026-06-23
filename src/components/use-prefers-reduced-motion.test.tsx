import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

let changeListener: (() => void) | null = null;
let currentMatches = false;

function stubMatchMedia(initial: boolean) {
  currentMatches = initial;
  changeListener = null;
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes("reduce") ? currentMatches : false;
        },
        media: query,
        addEventListener: (_type: string, cb: () => void) => {
          changeListener = cb;
        },
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function Harness() {
  const reduced = usePrefersReducedMotion();
  return <span data-testid="probe" data-reduced={reduced || undefined} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePrefersReducedMotion", () => {
  test("is false when the OS allows motion", () => {
    stubMatchMedia(false);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-reduced")).toBeNull();
  });

  test("is true when the OS prefers reduced motion", () => {
    stubMatchMedia(true);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-reduced")).toBe("true");
  });

  test("updates when the OS setting changes", () => {
    stubMatchMedia(false);
    const { getByTestId } = render(<Harness />);

    act(() => {
      currentMatches = true;
      changeListener?.();
    });

    expect(getByTestId("probe").getAttribute("data-reduced")).toBe("true");
  });

  test("assumes motion is allowed when rendered without matchMedia (SSR)", () => {
    const html = renderToString(<Harness />);

    expect(html).not.toContain("data-reduced");
  });
});
