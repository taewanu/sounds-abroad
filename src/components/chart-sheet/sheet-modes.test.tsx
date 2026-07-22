import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AudioEngine } from "@/lib/audio-engine";
import { createAudioStore } from "@/lib/audio-store";
import { DEFAULT_CHART_MODE, type ChartMode } from "@/lib/chart-mode";
import { SONGS_CHART, type ChartRef } from "@/lib/chart-ref";
import type { ChartTrack, Country, Track } from "@/lib/chart-schema";
import { AudioStoreContext } from "@/providers/audio-store-provider";

import { ChartSheet } from "./sheet";
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
}: {
  chart: ChartTracksState;
  country: Country;
}) {
  const [mode, setMode] = useState<ChartMode>(DEFAULT_CHART_MODE);
  return (
    <ChartSheet
      country={country}
      chart={chart}
      countryCode="tl"
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
  const utils = render(
    <AudioStoreContext.Provider value={store}>
      <ModeHost chart={chartState(over)} country={country} />
    </AudioStoreContext.Provider>,
  );
  return { ...utils, store };
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
});
