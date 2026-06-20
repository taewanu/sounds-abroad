import { render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useReducedMotion } from "./use-reduced-motion";

function stubReducedMotion(reduced: boolean) {
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

function Harness() {
  const reduced = useReducedMotion();
  return <span data-testid="probe" data-reduced={reduced || undefined} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useReducedMotion", () => {
  test("is false when the user has not asked to reduce motion", () => {
    stubReducedMotion(false);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-reduced")).toBeNull();
  });

  test("is true when the OS requests reduced motion", () => {
    stubReducedMotion(true);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-reduced")).toBe("true");
  });
});
