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

const TARGET = '[data-testid="anchor-target"]';

function Harness({
  selector,
  watch,
  withTarget = true,
}: {
  selector: string | null;
  watch?: unknown;
  withTarget?: boolean;
}) {
  const anchor = useTourAnchor(selector, watch);
  return (
    <>
      {withTarget && <div data-testid="anchor-target" />}
      <output data-testid="probe">
        {anchor
          ? `${anchor.rect.top},${anchor.rect.left},${anchor.rect.width},${anchor.rect.height}`
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
  test("is null when no selector is given", () => {
    const { getByTestId } = render(<Harness selector={null} />);

    expect(getByTestId("probe").textContent).toBe("null");
  });

  test("is null when no element matches the selector", () => {
    const { getByTestId } = render(
      <Harness selector={TARGET} withTarget={false} />,
    );

    expect(getByTestId("probe").textContent).toBe("null");
  });

  test("measures the matching element's box", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();

    const { getByTestId } = render(<Harness selector={TARGET} />);

    expect(getByTestId("probe").textContent).toBe("10,20,100,40");
  });

  test("re-measures when watch changes (target moved without resizing)", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();
    const { getByTestId, rerender } = render(
      <Harness selector={TARGET} watch={1} />,
    );

    box = { top: 200, left: 20, width: 100, height: 40 };
    rerender(<Harness selector={TARGET} watch={2} />);

    expect(getByTestId("probe").textContent).toBe("200,20,100,40");
  });

  test("re-measures on a window resize", () => {
    box = { top: 10, left: 20, width: 100, height: 40 };
    stubBoundingRect();
    const { getByTestId } = render(<Harness selector={TARGET} />);

    box = { top: 10, left: 20, width: 300, height: 40 };
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(getByTestId("probe").textContent).toBe("10,20,300,40");
  });
});
