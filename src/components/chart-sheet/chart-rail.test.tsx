import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SONGS_CHART } from "@/lib/chart-ref";
import type { Playlist } from "@/lib/chart-schema";

import { ChartRail } from "./chart-rail";
import { CHART_PANEL_ID, SONGS_CHART_LABEL } from "./chart-tabs";

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
  playlist("pl.a", "First playlist"),
  playlist("pl.b", "Second playlist"),
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
  expect(names).toEqual([
    SONGS_CHART_LABEL,
    "First playlist",
    "Second playlist",
  ]);
});

test("marks the chart on screen as selected", () => {
  renderRail({ current: "pl.b" });

  expect(
    screen
      .getByRole("tab", { name: "Second playlist" })
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
      .getByRole("tab", { name: "First playlist" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});

test("asks to open the chart that was tapped", () => {
  const { onOpen } = renderRail();

  fireEvent.click(screen.getByRole("tab", { name: "Second playlist" }));

  expect(onOpen).toHaveBeenCalledWith("pl.b");
});

test("a chart that would not load stops offering itself", () => {
  const { onOpen } = renderRail({ failed: new Set(["pl.a"]) });

  const tab = screen.getByRole("tab", { name: "First playlist" });
  expect((tab as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(tab);

  expect(onOpen).not.toHaveBeenCalled();
});

test("a country with no playlists renders no rail", () => {
  renderRail({ playlists: [] });

  expect(screen.queryByRole("tablist")).toBeNull();
});

test("the rail is one tab stop, on the chart that is open", () => {
  renderRail({ current: "pl.a" });

  const stops = screen
    .getAllByRole("tab")
    .filter((tab) => tab.tabIndex === 0)
    .map((tab) => tab.textContent);

  expect(stops).toEqual(["First playlist"]);
});

test("arrow keys move focus along the rail and wrap at both ends", () => {
  renderRail();
  const tabs = screen.getAllByRole("tab");
  const rail = screen.getByRole("tablist");
  tabs[0].focus();

  fireEvent.keyDown(rail, { key: "ArrowRight" });
  expect(document.activeElement).toBe(tabs[1]);

  fireEvent.keyDown(rail, { key: "ArrowLeft" });
  fireEvent.keyDown(rail, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(tabs[2]);
});

test("Home and End reach the ends of the rail", () => {
  renderRail();
  const tabs = screen.getAllByRole("tab");
  const rail = screen.getByRole("tablist");
  tabs[0].focus();

  fireEvent.keyDown(rail, { key: "End" });
  expect(document.activeElement).toBe(tabs[2]);

  fireEvent.keyDown(rail, { key: "Home" });
  expect(document.activeElement).toBe(tabs[0]);
});

test("moving focus does not open a chart", () => {
  const { onOpen } = renderRail();
  const rail = screen.getByRole("tablist");
  screen.getAllByRole("tab")[0].focus();

  fireEvent.keyDown(rail, { key: "ArrowRight" });

  expect(onOpen).not.toHaveBeenCalled();
});

test("arrowing skips a chart that would not load", () => {
  renderRail({ failed: new Set(["pl.a"]) });
  const tabs = screen.getAllByRole("tab");
  const rail = screen.getByRole("tablist");
  tabs[0].focus();

  fireEvent.keyDown(rail, { key: "ArrowRight" });

  expect(document.activeElement).toBe(tabs[2]);
});

test("announces each chart's position in the set", () => {
  renderRail();

  const tab = screen.getByRole("tab", { name: "Second playlist" });
  expect(tab.getAttribute("aria-posinset")).toBe("3");
  expect(tab.getAttribute("aria-setsize")).toBe("3");
});

test("the chart being read is the one marked as waiting", () => {
  renderRail({ current: SONGS_CHART, pending: "pl.a" });

  expect(
    screen.getByRole("tab", { name: "First playlist" }).className,
  ).toContain("chart-tab-waiting");
  expect(
    screen.getByRole("tab", { name: SONGS_CHART_LABEL }).className,
  ).not.toContain("chart-tab-waiting");
});

test("each chart's tab names the list it controls", () => {
  renderRail({ current: SONGS_CHART });

  for (const tab of screen.getAllByRole("tab")) {
    expect(tab.getAttribute("aria-controls")).toBe(CHART_PANEL_ID);
  }
});
