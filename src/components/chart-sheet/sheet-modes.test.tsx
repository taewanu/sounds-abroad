import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { createAudioStore } from "@/lib/audio-store";
import { DEFAULT_CHART_MODE, type ChartMode } from "@/lib/chart-mode";
import { SONGS_CHART, type ChartRef } from "@/lib/chart-ref";
import type { ChartTrack, Country, Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { ChartSheet, ROWS_ENTER_TOTAL_MS } from "./sheet";
import type { ChartTracksState } from "./use-chart-tracks";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track: trackEvent }));

function makeMockAudio(): AudioEngine {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// The sheet observes a sentinel under the last row; jsdom has none, and no test
// here reads that far, so a stub that never fires is enough.
class SilentObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function song(rank: number, spread?: number): Track {
  return {
    rank,
    name: `Song ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://art.test/song.jpg",
    appleUrl: `https://music.apple.com/xx/song/${rank}`,
    spotifyUrl: `https://open.spotify.com/track/${rank}`,
    commentary: null,
    ...(spread === undefined ? {} : { spread }),
  };
}

const PLAYLIST_ID: ChartRef = "pl.everywhere";

// One track per spread case: shared with several countries, shared with one
// other, and carried nowhere else.
const EAGER = [song(1, 9), song(2, 2), song(3, 1)];
const TAIL = [song(4, 1), song(5, 6)];

const COUNTRY: Country = {
  name: "Testland",
  valid: true,
  tracks: EAGER,
  playlists: [
    {
      id: PLAYLIST_ID,
      name: "Everywhere",
      appleUrl: "https://music.apple.com/xx/playlist/1",
      artworkUrl: "https://art.test/playlist.jpg",
      genres: [{ name: "Pop", count: 4 }],
      trackCount: 2,
    },
  ],
  playlistsValid: true,
};

function chartState(over: Partial<ChartTracksState> = {}): ChartTracksState {
  return {
    ref: SONGS_CHART,
    tracks: EAGER,
    pending: null,
    failed: new Set(),
    open: () => {},
    peek: () => null,
    read: async () => [],
    tail: null,
    tailPending: false,
    tailFailed: false,
    readTail: () => {},
    peekTail: () => null,
    ...over,
  };
}

// The mode lives above the sheet, so a host holds it for these tests the way
// the screen does: a switch has to travel out and back for the rows to change.
function ModeHost({
  chart,
  country,
  countryCode,
}: {
  chart: ChartTracksState;
  country: Country;
  countryCode: string;
}) {
  const [mode, setMode] = useState<ChartMode>(DEFAULT_CHART_MODE);
  return (
    <ChartSheet
      country={country}
      chart={chart}
      countryCode={countryCode}
      mode={mode}
      onModeChange={setMode}
      snap="full"
      onSnapChange={() => {}}
    />
  );
}

function renderSheet(
  over: Partial<ChartTracksState> = {},
  country: Country = COUNTRY,
) {
  const store = createAudioStore(() => makeMockAudio());
  const tree = (chart: ChartTracksState, code: string, data: Country) => (
    <AudioStoreContext.Provider value={store}>
      <ModeHost chart={chart} country={data} countryCode={code} />
    </AudioStoreContext.Provider>
  );
  const utils = render(tree(chartState(over), "tl", country));
  // Re-renders the same tree with another chart or country, so a switch the
  // screen would drive can be driven here without remounting the mode above it.
  const swap = (
    next: Partial<ChartTracksState> = {},
    code = "tl",
    data: Country = country,
  ) => utils.rerender(tree(chartState(next), code, data));
  return { ...utils, store, swap };
}

/** Whether the track list is set to play its arrival animation. */
function rowsEntering(container: HTMLElement): boolean {
  return (
    container.querySelector("ol")?.hasAttribute("data-rows-entering") ?? false
  );
}

function openOnlyHere() {
  fireEvent.click(screen.getByRole("button", { name: "Only here" }));
}

/** The track names on screen, in the order the list shows them. */
function listedNames(): string[] {
  return screen
    .getAllByRole("listitem")
    .flatMap((row) => {
      const rank = row.getAttribute("data-rank");
      return rank ? [`Song ${rank}`] : [];
    })
    .filter((name, index, all) => all.indexOf(name) === index);
}

beforeEach(() => {
  trackEvent.mockClear();
  vi.stubGlobal("IntersectionObserver", SilentObserver);
});

describe("ChartSheet chart modes", () => {
  test("opens on most played, listing the chart in its own order", () => {
    renderSheet();

    expect(
      screen
        .getByRole("button", { name: "Most played" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(listedNames()).toEqual(["Song 1", "Song 2", "Song 3"]);
  });

  test("only here lists the tracks no other country carries", () => {
    renderSheet({ tail: TAIL });

    openOnlyHere();

    expect(listedNames()).toEqual(["Song 3", "Song 4"]);
  });

  test("only here filters the whole chart, not the eager rows alone", () => {
    renderSheet({ tail: TAIL });

    openOnlyHere();

    expect(screen.queryByText("Song 4")).not.toBeNull();
  });

  test("asks for the rest of the chart when a mode needs it", () => {
    const readTail = vi.fn();
    renderSheet({ readTail });

    openOnlyHere();

    expect(readTail).toHaveBeenCalledTimes(1);
  });

  test("says the chart is still arriving while it reads", () => {
    renderSheet({ tailPending: true });

    openOnlyHere();

    expect(
      screen
        .getByRole("button", { name: "Only here" })
        .classList.contains("chart-tab-waiting"),
    ).toBe(true);
  });

  test("does not say it is working once the chart is in hand", () => {
    renderSheet({ tail: TAIL });

    openOnlyHere();

    expect(
      screen
        .getByRole("button", { name: "Only here" })
        .classList.contains("chart-tab-waiting"),
    ).toBe(false);
  });

  test("keeps the chart and the country on a switch", () => {
    renderSheet({ tail: TAIL });

    openOnlyHere();

    expect(
      screen
        .getByRole("tab", { name: "Top Songs" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByText("Testland")).not.toBeNull();
  });

  test("leaves playback where it was across a switch", () => {
    const { store } = renderSheet({ tail: TAIL });
    const before = store.getState();

    openOnlyHere();

    expect(store.getState()).toBe(before);
  });

  test("records opening a mode, distinguishing the two", () => {
    renderSheet({ tail: TAIL });

    openOnlyHere();
    fireEvent.click(screen.getByRole("button", { name: "Most played" }));

    expect(trackEvent.mock.calls).toEqual([
      ["chart_mode_opened", { country: "tl", mode: "only_here" }],
      ["chart_mode_opened", { country: "tl", mode: "most_played" }],
    ]);
  });

  test("records nothing for a tap on the mode already open", () => {
    renderSheet({ tail: TAIL });

    fireEvent.click(screen.getByRole("button", { name: "Most played" }));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  test("offers no modes on a playlist chart, whose tracks carry no spread", () => {
    const playlistTracks: ChartTrack[] = [song(1), song(2)];
    renderSheet({ ref: PLAYLIST_ID, tracks: playlistTracks });

    expect(screen.queryByRole("button", { name: "Only here" })).toBeNull();
  });

  test("shows no gem in only here, whose claim its weakest tier contradicts", () => {
    renderSheet({ tail: TAIL });

    expect(screen.queryByText(/Local Gem/i)).not.toBeNull();

    openOnlyHere();

    expect(screen.queryByText(/Local Gem/i)).toBeNull();
  });

  test("an empty only here says so rather than looking unloaded", () => {
    // Nothing on this chart is exclusive, so the mode has a real answer: none.
    const shared = [song(1, 4), song(2, 9)];
    renderSheet({ tracks: shared, tail: [] }, { ...COUNTRY, tracks: shared });

    openOnlyHere();

    expect(screen.queryByText("Nothing is only here today")).not.toBeNull();
  });

  test("says nothing about an empty only here while the chart is arriving", () => {
    const shared = [song(1, 4)];
    renderSheet(
      { tracks: shared, tailPending: true },
      { ...COUNTRY, tracks: shared },
    );

    openOnlyHere();

    expect(screen.queryByText("Nothing is only here today")).toBeNull();
  });

  test("the rows arrive when the mode switches", () => {
    const { container } = renderSheet({ tail: TAIL });

    openOnlyHere();

    expect(rowsEntering(container)).toBe(true);
  });

  test("the rows do not arrive when a chart had to be read first", () => {
    const playlistTracks: ChartTrack[] = [song(1), song(2)];
    const { container, swap } = renderSheet();

    swap({ pending: PLAYLIST_ID });
    swap({ ref: PLAYLIST_ID, tracks: playlistTracks });

    // The chart already said it was coming by receding and pulsing its tab, so
    // an entrance on top of that wait would read as more waiting.
    expect(rowsEntering(container)).toBe(false);
  });

  test("the rows arrive for a chart that opened without a wait", () => {
    const playlistTracks: ChartTrack[] = [song(1), song(2)];
    const { container, swap } = renderSheet();

    // A chart already read once opens from the session's cache, so nothing was
    // waited on and the movement is the only thing announcing the change.
    swap({ ref: PLAYLIST_ID, tracks: playlistTracks });

    expect(rowsEntering(container)).toBe(true);
  });

  test("the rows do not arrive on a fresh country", () => {
    const { container, swap } = renderSheet();

    swap({}, "other");

    expect(rowsEntering(container)).toBe(false);
  });

  test("says the chart stops short when the rest would not load", () => {
    renderSheet({ tailFailed: true });

    expect(
      screen.queryByText("The rest of this chart would not load."),
    ).not.toBeNull();
  });

  test("claims nothing about only here from a chart it could not finish reading", () => {
    // Every eager row is carried elsewhere, so only here holds nothing of the
    // twenty five in hand. It cannot speak for the rows it never got.
    const shared = [song(1, 4), song(2, 9)];
    renderSheet(
      { tracks: shared, tailFailed: true },
      { ...COUNTRY, tracks: shared },
    );

    openOnlyHere();

    expect(screen.queryByText("Nothing is only here today")).toBeNull();
    expect(
      screen.queryByText("The rest of this chart would not load."),
    ).not.toBeNull();
  });

  test("the arrival stops once the rows have landed", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderSheet({ tail: TAIL });

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Only here" }));
      });
      expect(rowsEntering(container)).toBe(true);

      act(() => {
        vi.advanceTimersByTime(ROWS_ENTER_TOTAL_MS);
      });

      // Rows read in later join this same list rather than replacing it, so a
      // flag left on would animate them as though the question had changed.
      expect(rowsEntering(container)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("the empty state opens a playlist chart in one action", () => {
    const open = vi.fn();
    const shared = [song(1, 4), song(2, 9)];
    renderSheet(
      { tracks: shared, tail: [], open },
      { ...COUNTRY, tracks: shared },
    );

    openOnlyHere();
    fireEvent.click(screen.getByRole("button", { name: "Open Everywhere" }));

    expect(open).toHaveBeenCalledWith(PLAYLIST_ID);
  });

  test("a country carrying no playlists still reads as an answer", () => {
    const shared = [song(1, 4)];
    renderSheet(
      { tracks: shared, tail: [] },
      { name: "Testland", valid: true, tracks: shared },
    );

    openOnlyHere();

    expect(screen.queryByText("Nothing is only here today")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Open / })).toBeNull();
  });

  test("a single exclusive track is listed rather than called nothing", () => {
    const one = [song(1, 4), song(2, 1)];
    renderSheet({ tracks: one, tail: [] }, { ...COUNTRY, tracks: one });

    openOnlyHere();

    expect(listedNames()).toEqual(["Song 2"]);
    expect(screen.queryByText("Nothing is only here today")).toBeNull();
  });

  test("most played is reachable from the empty state", () => {
    const shared = [song(1, 4)];
    renderSheet({ tracks: shared, tail: [] }, { ...COUNTRY, tracks: shared });

    openOnlyHere();
    fireEvent.click(screen.getByRole("button", { name: "Most played" }));

    expect(listedNames()).toEqual(["Song 1"]);
  });
});
