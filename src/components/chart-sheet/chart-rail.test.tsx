import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SONGS_CHART } from "@/lib/chart-ref";
import type { Playlist } from "@/lib/chart-schema";

import { ChartRail, SONGS_CHART_LABEL } from "./chart-rail";

function playlist(id: string, name: string): Playlist {
  return {
    id,
    name,
    appleUrl: `https://music.apple.com/br/playlist/${id}`,
    artworkUrl: "https://art.test/p.jpg",
    genres: [],
    trackCount: 20,
  };
}

const PLAYLISTS = [
  playlist("pl.a", "Pagode 2026"),
  playlist("pl.b", "Sertanejo VIP"),
];

function renderRail(overrides: Partial<Parameters<typeof ChartRail>[0]> = {}) {
  const onOpen = vi.fn();
  render(
    <ChartRail
      playlists={PLAYLISTS}
      current={SONGS_CHART}
      pending={null}
      failed={new Set()}
      onOpen={onOpen}
      {...overrides}
    />,
  );
  return { onOpen };
}

test("lists the songs chart first, then the playlists as published", () => {
  renderRail();

  const names = screen.getAllByRole("tab").map((tab) => tab.textContent);
  expect(names).toEqual([SONGS_CHART_LABEL, "Pagode 2026", "Sertanejo VIP"]);
});

test("marks the chart on screen as selected", () => {
  renderRail({ current: "pl.b" });

  expect(
    screen
      .getByRole("tab", { name: "Sertanejo VIP" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    screen
      .getByRole("tab", { name: SONGS_CHART_LABEL })
      .getAttribute("aria-selected"),
  ).toBe("false");
});

test("marks a chart asked for as selected before its tracks arrive", () => {
  renderRail({ current: SONGS_CHART, pending: "pl.a" });

  expect(
    screen
      .getByRole("tab", { name: "Pagode 2026" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});

test("asks to open the chart that was tapped", () => {
  const { onOpen } = renderRail();

  fireEvent.click(screen.getByRole("tab", { name: "Sertanejo VIP" }));

  expect(onOpen).toHaveBeenCalledWith("pl.b");
});

test("a chart that would not load stops offering itself", () => {
  const { onOpen } = renderRail({ failed: new Set(["pl.a"]) });

  const tab = screen.getByRole("tab", { name: "Pagode 2026" });
  expect((tab as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(tab);

  expect(onOpen).not.toHaveBeenCalled();
});

test("a country with no playlists renders no rail", () => {
  renderRail({ playlists: [] });

  expect(screen.queryByRole("tablist")).toBeNull();
});
