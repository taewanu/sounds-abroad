import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

import { CountrySelector } from "./country-selector";

const openList = () =>
  fireEvent.click(screen.getByRole("button", { name: /choose a country/i }));

describe("CountrySelector", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams("cc=br");
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    replaceState.mockRestore();
  });

  test("labels the toggle with the current country and starts collapsed", () => {
    render(<CountrySelector />);

    const toggle = screen.getByRole("button", {
      name: /currently showing Brazil/i,
    });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Countries" })).toBeNull();
  });

  test("opens a Countries landmark of named country buttons", () => {
    render(<CountrySelector />);

    openList();

    const nav = screen.getByRole("navigation", { name: "Countries" });
    expect(within(nav).getByRole("button", { name: "France" })).toBeDefined();
    expect(within(nav).getByRole("button", { name: "Japan" })).toBeDefined();
  });

  test("selecting a country writes ?cc= via replaceState and announces it", () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole("button", { name: "France" }));

    expect(replaceState).toHaveBeenCalledWith(null, "", "?cc=fr");
    expect(screen.getByRole("status").textContent).toContain("France");
  });

  test("stays open after selecting so exploration can continue", () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole("button", { name: "France" }));

    expect(screen.getByRole("navigation", { name: "Countries" })).toBeDefined();
  });

  test("Escape closes the list and returns focus to the toggle", () => {
    render(<CountrySelector />);
    const toggle = screen.getByRole("button", { name: /choose a country/i });
    fireEvent.click(toggle);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Countries" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});
