import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { COUNTRY_KR } from "@/lib/__fixtures__";
import { AudioStoreProvider } from "@/providers/audio-store-provider";

import { ChartSheet, type SnapState } from "./sheet";

function renderSheet(snap: SnapState) {
  const onSnapChange = vi.fn();
  const utils = render(
    <AudioStoreProvider>
      <ChartSheet
        country={COUNTRY_KR}
        snap={snap}
        onSnapChange={onSnapChange}
      />
    </AudioStoreProvider>,
  );
  return { ...utils, onSnapChange };
}

describe("ChartSheet", () => {
  test("renders each track in the country", () => {
    renderSheet("peek");

    for (const track of COUNTRY_KR.tracks) {
      expect(screen.getByText(track.name)).toBeDefined();
      expect(screen.getByText(track.artist)).toBeDefined();
    }
  });

  test("renders the country name as the dialog title", () => {
    renderSheet("peek");

    expect(screen.getByText(COUNTRY_KR.name)).toBeDefined();
  });

  test("exposes data-snap='peek' when snap prop is peek", () => {
    renderSheet("peek");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("peek");
  });

  test("exposes data-snap='full' when snap prop is full", () => {
    renderSheet("full");

    const sheet = screen.getByTestId("chart-sheet");
    expect(sheet.getAttribute("data-snap")).toBe("full");
  });

  test("fires onSnapChange with 'full' when handle clicked while peek", () => {
    const { onSnapChange } = renderSheet("peek");

    fireEvent.click(screen.getByRole("button", { name: /expand chart/i }));

    expect(onSnapChange).toHaveBeenCalledWith("full");
  });

  test("fires onSnapChange with 'peek' when handle clicked while full", () => {
    const { onSnapChange } = renderSheet("full");

    fireEvent.click(screen.getByRole("button", { name: /collapse chart/i }));

    expect(onSnapChange).toHaveBeenCalledWith("peek");
  });
});
