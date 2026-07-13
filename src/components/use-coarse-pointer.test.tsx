import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useCoarsePointer } from "./use-coarse-pointer";

let changeListener: (() => void) | null = null;
let currentMatches = false;

function stubMatchMedia(initial: boolean) {
  currentMatches = initial;
  changeListener = null;
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes("coarse") ? currentMatches : false;
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
  const coarse = useCoarsePointer();
  return <span data-testid="probe" data-coarse={coarse || undefined} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCoarsePointer", () => {
  test("is false when the primary pointer is fine", () => {
    stubMatchMedia(false);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-coarse")).toBeNull();
  });

  test("is true when the primary pointer is coarse", () => {
    stubMatchMedia(true);

    const { getByTestId } = render(<Harness />);

    expect(getByTestId("probe").getAttribute("data-coarse")).toBe("true");
  });

  test("updates when the primary pointer changes", () => {
    stubMatchMedia(false);
    const { getByTestId } = render(<Harness />);

    act(() => {
      currentMatches = true;
      changeListener?.();
    });

    expect(getByTestId("probe").getAttribute("data-coarse")).toBe("true");
  });

  test("assumes a fine pointer when rendered without matchMedia (SSR)", () => {
    const html = renderToString(<Harness />);

    expect(html).not.toContain("data-coarse");
  });
});
