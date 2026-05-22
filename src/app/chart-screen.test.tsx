import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CHARTS, COUNTRY_US } from "@/lib/__fixtures__";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

import { ChartScreen } from "./chart-screen";

describe("ChartScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSearchParams.value = new URLSearchParams();
  });

  test("renders the country's tracks when ?cc=us", () => {
    mockSearchParams.value = new URLSearchParams("cc=us");

    render(<ChartScreen charts={CHARTS} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
  });

  test("picks the first un-seen country when no URL param", async () => {
    render(<ChartScreen charts={CHARTS} rng={() => 0} />);

    expect(await screen.findByText(COUNTRY_US.tracks[0].name)).toBeDefined();
  });

  test("falls through to random when ?cc= is invalid", async () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} rng={() => 0} />);

    expect(await screen.findByText(COUNTRY_US.tracks[0].name)).toBeDefined();
  });
});
