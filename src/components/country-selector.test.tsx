import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { globeChartStore } from "@/lib/globe-chart-store";

import { CountrySelector } from "./country-selector";

const openList = () =>
  fireEvent.click(screen.getByRole("button", { name: /choose a country/i }));

describe("CountrySelector", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    globeChartStore.setState({ selectedCountry: "br", readMode: false });
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    globeChartStore.setState({ selectedCountry: null, readMode: false });
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

  test("groups the countries into labeled continent regions", () => {
    render(<CountrySelector />);
    openList();

    const americas = screen.getByRole("group", { name: "Americas" });
    expect(
      within(americas).getByRole("button", { name: "Brazil" }),
    ).toBeDefined();
    for (const region of ["Americas", "Europe", "Africa", "Asia", "Oceania"]) {
      expect(screen.getByRole("group", { name: region })).toBeDefined();
    }
  });

  test("selecting a country drives the globe via the store, mirrors ?cc=, and announces it", () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByRole("button", { name: "France" }));

    expect(globeChartStore.getState().selectedCountry).toBe("fr");
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

  test("the close button closes the list and returns focus to the toggle", () => {
    render(<CountrySelector />);
    const toggle = screen.getByRole("button", { name: /choose a country/i });
    fireEvent.click(toggle);

    fireEvent.click(
      screen.getByRole("button", { name: /close country list/i }),
    );

    expect(screen.queryByRole("navigation", { name: "Countries" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  test("tapping the scrim closes the list", () => {
    render(<CountrySelector />);
    openList();

    fireEvent.click(screen.getByTestId("country-scrim"));

    expect(screen.queryByRole("navigation", { name: "Countries" })).toBeNull();
  });

  test("in read mode the badge is inert and non-interactive, off the sheet's grip", () => {
    globeChartStore.setState({ readMode: true });

    render(<CountrySelector />);

    const region = screen.getByTestId("country-toggle-region");
    expect(region.getAttribute("inert")).not.toBeNull();
    expect(region.className).toContain("pointer-events-none");
  });

  test("leaving read mode restores the badge to interactive", () => {
    globeChartStore.setState({ readMode: false });

    render(<CountrySelector />);

    const region = screen.getByTestId("country-toggle-region");
    expect(region.getAttribute("inert")).toBeNull();
    expect(region.className).not.toContain("pointer-events-none");
  });
});
