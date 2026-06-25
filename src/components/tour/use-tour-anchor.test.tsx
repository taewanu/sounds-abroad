import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useTourAnchor } from "./use-tour-anchor";

let box = { top: 0, left: 0, width: 0, height: 0 };

function stubBoundingRect() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        ...box,
        right: box.left + box.width,
        bottom: box.top + box.height,
        x: box.left,
        y: box.top,
        toJSON: () => "",
      }) as DOMRect,
  );
}

function Harness({
  testId,
  watch,
  withTarget = true,
}: {
  testId: string | null;
  watch?: unknown;
  withTarget?: boolean;
}) {
  const rect = useTourAnchor(testId, watch);
  return (
    <>
      {withTarget && <div data-testid="anchor-target" />}
      <output data-testid="probe">
        {rect
          ? `${rect.top},${rect.left},${rect.width},${rect.height}`
          : "null"}
      </output>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  box = { top: 0, left: 0, width: 0, height: 0 };
});

describe("useTourAnchor", () => {
  test("is null when no testId is given", () => {
    const { getByTestId } = render(<Harness testId={null} />);

    expect(getByTestId("probe").textContent).toBe("null");
  });

  test("is null when no element matches the testId", () => {
    const { getByTestId } = render(
      <Harness testId="anchor-target" withTarget={false} />,
    );

    expect(getByTestId("probe").textContent).toBe("null");
  });

  test("measures the matching element's box", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();

    const { getByTestId } = render(<Harness testId="anchor-target" />);

    expect(getByTestId("probe").textContent).toBe("10,20,100,40");
  });

  test("re-measures when watch changes (target moved without resizing)", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();
    const { getByTestId, rerender } = render(
      <Harness testId="anchor-target" watch={1} />,
    );

    box = { top: 200, left: 20, width: 100, height: 40 };
    rerender(<Harness testId="anchor-target" watch={2} />);

    expect(getByTestId("probe").textContent).toBe("200,20,100,40");
  });

  test("re-measures on a window resize", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();
    const { getByTestId } = render(<Harness testId="anchor-target" />);

    box = { top: 10, left: 20, width: 300, height: 40 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(getByTestId("probe").textContent).toBe("10,20,300,40");
  });
});
