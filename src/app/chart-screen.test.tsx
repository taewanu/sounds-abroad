import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CHARTS, CODE_US, COUNTRY_US } from "@/lib/__fixtures__";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));
const mockRouter = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
  useRouter: () => mockRouter,
}));

import { ChartScreen } from "./chart-screen";

describe("ChartScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSearchParams.value = new URLSearchParams();
    mockRouter.replace.mockReset();
    mockRouter.push.mockReset();
  });

  test("renders the country's tracks when ?cc= matches a country", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
  });

  test("picks an unvisited country and syncs it to ?cc= when no URL param", async () => {
    render(<ChartScreen charts={CHARTS} />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\?cc=[a-z]{2}$/),
      );
    });
  });

  test("does not replace URL when ?cc= is already valid", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} />);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("falls through to random when ?cc= is invalid", async () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\?cc=[a-z]{2}$/),
      );
    });
    const [url] = mockRouter.replace.mock.calls[0];
    expect(url).not.toContain("xx");
  });
});
