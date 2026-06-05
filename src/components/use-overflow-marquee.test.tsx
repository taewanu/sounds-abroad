import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useOverflowMarquee } from "./use-overflow-marquee";

let resizeCallback: (() => void) | null = null;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = () => callback([], this as unknown as ResizeObserver);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function stubEnvironment({ reducedMotion = false } = {}) {
  resizeCallback = null;
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("reduce") ? reducedMotion : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function sizeElement(el: Element, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
}

function Harness({ enabled }: { enabled: boolean }) {
  const { ref, active, style } = useOverflowMarquee<HTMLSpanElement>({
    enabled,
    text: "title",
  });
  return (
    <span
      data-testid="viewport"
      ref={ref}
      data-active={active || undefined}
      style={style}
    />
  );
}

function measureWith(scrollWidth: number, clientWidth: number, enabled = true) {
  const { getByTestId } = render(<Harness enabled={enabled} />);
  const el = getByTestId("viewport");
  sizeElement(el, scrollWidth, clientWidth);
  act(() => resizeCallback?.());
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useOverflowMarquee", () => {
  test("activates when content overflows its container", () => {
    stubEnvironment();

    const el = measureWith(220, 150);

    expect(el.getAttribute("data-active")).toBe("true");
  });

  test("stays inactive when content exactly fits", () => {
    stubEnvironment();

    const el = measureWith(150, 150);

    expect(el.getAttribute("data-active")).toBeNull();
  });

  test("stays inactive when content is narrower than its container", () => {
    stubEnvironment();

    const el = measureWith(100, 150);

    expect(el.getAttribute("data-active")).toBeNull();
  });

  test("stays inactive under prefers-reduced-motion even when overflowing", () => {
    stubEnvironment({ reducedMotion: true });

    const el = measureWith(220, 150);

    expect(el.getAttribute("data-active")).toBeNull();
  });

  test("stays inactive when disabled even when overflowing", () => {
    stubEnvironment();

    const el = measureWith(220, 150, false);

    expect(el.getAttribute("data-active")).toBeNull();
  });

  test("exposes the overflow distance and a distance-scaled duration when active", () => {
    stubEnvironment();

    const el = measureWith(400, 150);

    expect(el.style.getPropertyValue("--marquee-distance")).toBe("250px");
    expect(el.style.getPropertyValue("--marquee-duration")).toBe("11250ms");
  });

  test("floors the duration so small overflows do not scroll frantically", () => {
    stubEnvironment();

    const el = measureWith(220, 150);

    expect(el.style.getPropertyValue("--marquee-distance")).toBe("70px");
    expect(el.style.getPropertyValue("--marquee-duration")).toBe("4000ms");
  });
});
