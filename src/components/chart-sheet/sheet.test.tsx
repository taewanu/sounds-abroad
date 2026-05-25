import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { COUNTRY_KR } from "@/lib/__fixtures__";
import { AudioStoreProvider } from "@/providers/audio-store-provider";

import { ChartSheet, type SnapState } from "./sheet";

const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

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

  test("scrolls currentTrack into view when sheet transitions from closed", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[2].rank;
    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="closed"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  test("does not scroll when transitioning between peek and full", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const rank = COUNTRY_KR.tracks[0].rank;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    scrollIntoViewMock.mockClear();

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="full"
          onSnapChange={vi.fn()}
          currentTrackRank={rank}
        />
      </AudioStoreProvider>,
    );

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  test("does not scroll when currentTrackRank is null", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const { rerender } = render(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="closed"
          onSnapChange={vi.fn()}
          currentTrackRank={null}
        />
      </AudioStoreProvider>,
    );

    rerender(
      <AudioStoreProvider>
        <ChartSheet
          country={COUNTRY_KR}
          snap="peek"
          onSnapChange={vi.fn()}
          currentTrackRank={null}
        />
      </AudioStoreProvider>,
    );

    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
