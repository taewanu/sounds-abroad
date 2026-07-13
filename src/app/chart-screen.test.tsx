import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CHARTS, CODE_BR, CODE_US, COUNTRY_US } from "@/lib/__fixtures__";
import type { AudioEngine } from "@/lib/audio-engine";
import type { ChartFile } from "@/lib/chart-schema";
import { globeChartStore } from "@/lib/globe-chart-store";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

// A controllable stand-in for the browser audio engine so the component tree
// can play and end a track under happy-dom, which has no AudioContext.
const audioEngine = vi.hoisted(() => {
  let listeners: Partial<Record<string, Array<() => void>>> = {};
  return {
    reset() {
      listeners = {};
    },
    create(): AudioEngine {
      let src = "";
      return {
        get src() {
          return src;
        },
        set src(value: string) {
          src = value;
        },
        play: () => Promise.resolve(),
        pause: () => {},
        setVolume: () => {},
        addEventListener: (type, listener) => {
          (listeners[type] ??= []).push(listener);
        },
        removeEventListener: () => {},
      };
    },
    end() {
      (listeners.ended ?? []).forEach((listener) => listener());
    },
  };
});

vi.mock("@/lib/audio-engine", () => ({
  createBrowserAudioEngine: () => audioEngine.create(),
}));

import { ChartScreen } from "./chart-screen";

// A chart whose middle track has no preview, so the correct next track from #1
// is #3. Any "next" that walks a bare index would land on the unplayable #2.
const ADJ_CODE = "zz";
// A second country whose head and tail share one preview asset (distinct songs,
// distinct Apple ids). Adjacency must locate the current track by identity: a
// previewUrl-keyed walk would find the head's index for the tail and step from
// the wrong row.
const SHARED_CODE = "zx";
const SHARED_PREVIEW = "https://example.com/shared.m4a";
const ADJACENCY_CHARTS: ChartFile = {
  lastUpdated: "2026-04-25T03:00:00Z",
  countries: {
    [ADJ_CODE]: {
      name: "Chart under test",
      valid: true,
      tracks: [
        {
          rank: 1,
          name: "Playable head",
          artist: "Head artist",
          previewUrl: "https://example.com/head.m4a",
          artworkUrl: "https://example.com/head.jpg",
          appleUrl: "https://music.apple.com/x/head",
          spotifyUrl: "https://open.spotify.com/x/head",
        },
        {
          rank: 2,
          name: "Unplayable gap",
          artist: "Gap artist",
          previewUrl: null,
          artworkUrl: "https://example.com/gap.jpg",
          appleUrl: "https://music.apple.com/x/gap",
          spotifyUrl: "https://open.spotify.com/x/gap",
        },
        {
          rank: 3,
          name: "Playable tail",
          artist: "Tail artist",
          previewUrl: "https://example.com/tail.m4a",
          artworkUrl: "https://example.com/tail.jpg",
          appleUrl: "https://music.apple.com/x/tail",
          spotifyUrl: "https://open.spotify.com/x/tail",
        },
      ],
    },
    [SHARED_CODE]: {
      name: "Shared-preview chart",
      valid: true,
      tracks: [
        {
          rank: 1,
          name: "Shared head",
          artist: "Shared head artist",
          previewUrl: SHARED_PREVIEW,
          artworkUrl: "https://example.com/sh-head.jpg",
          appleUrl: "https://music.apple.com/x/album?i=201",
          spotifyUrl: "https://open.spotify.com/x/sh-head",
        },
        {
          rank: 2,
          name: "Shared tail",
          artist: "Shared tail artist",
          previewUrl: SHARED_PREVIEW,
          artworkUrl: "https://example.com/sh-tail.jpg",
          appleUrl: "https://music.apple.com/x/album?i=202",
          spotifyUrl: "https://open.spotify.com/x/sh-tail",
        },
      ],
    },
  },
};

function playingRank(container: HTMLElement): string | null {
  return (
    container
      .querySelector('li[data-state="playing"]')
      ?.getAttribute("data-rank") ?? null
  );
}

// Render the chart, start the head track, run one "advance" gesture, and report
// the rank left playing.
function advanceFromHead(advance: () => void): string | null {
  audioEngine.reset();
  const { container, unmount } = render(
    <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Play preview of Playable head by Head artist",
    }),
  );
  advance();
  const rank = playingRank(container);
  unmount();
  return rank;
}

describe("ChartScreen", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams();
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    replaceState.mockRestore();
  });

  test("renders the chart for a valid ?cc= without touching the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("falls back to defaultCountryCode and writes it to the URL when ?cc= is absent", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("falls back to defaultCountryCode for an invalid ?cc=", () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("canonicalizes an uppercase ?cc= in the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US.toUpperCase()}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });
});

describe("ChartScreen globe coupling", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    globeChartStore.setState({
      readMode: false,
      settleSignal: 0,
      selectedCountry: null,
    });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("publishes the resolved ?cc= country to the globe", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_US);
  });

  test("publishes the default country to the globe when ?cc= is absent", () => {
    mockSearchParams.value = new URLSearchParams();

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_BR);
  });

  test("publishes read mode to the globe at full and clears it back at peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(globeChartStore.getState().readMode).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse chart" }));
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("a settle raises a dismissed sheet back to peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("a settle leaves an open sheet where it is", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    expect(sheet.dataset.snap).toBe("peek");
    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("releases read mode when the chart unmounts", () => {
    const { unmount } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    unmount();
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("a settle never starts audio on its own", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    act(() => {
      globeChartStore.getState().signalSettle();
    });

    // The mini player only mounts once a track plays; its absence after a settle
    // shows the landing selected a country without starting audio.
    expect(screen.queryByRole("button", { name: "Reopen chart" })).toBeNull();
  });
});

describe("ChartScreen commentary badge", () => {
  const commentaryTrack = COUNTRY_US.tracks.find((t) => t.commentary)!;
  const plainTrack = COUNTRY_US.tracks.find(
    (t) => !t.commentary && t.previewUrl,
  )!;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    audioEngine.reset();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("no badge renders while the playing track has no commentary", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Play preview of ${plainTrack.name} by ${plainTrack.artist}`,
      }),
    );

    expect(
      screen.queryByRole("button", { name: /why this track is trending/i }),
    ).toBeNull();
  });

  test("the badge reopens the sheet and expands the now-playing row's commentary card", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);
    const sheet = screen.getByTestId("chart-sheet");
    fireEvent.click(
      screen.getByRole("button", {
        name: `Play preview of ${commentaryTrack.name} by ${commentaryTrack.artist}`,
      }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    fireEvent.click(
      screen.getByRole("button", { name: /why this track is trending/i }),
    );

    expect(sheet.dataset.snap).toBe("peek");
    expect(
      screen.getByRole("button", { name: "Collapse commentary" }),
    ).toBeDefined();
  });
});

describe("ChartScreen auto-advance", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${ADJ_CODE}`);
    audioEngine.reset();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a track ending advances to the next playable track, skipping one with no preview", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );
    expect(playingRank(container)).toBe("1");

    act(() => {
      audioEngine.end();
    });

    expect(playingRank(container)).toBe("3");
  });

  test("auto-advance lands on the track that pressing Next lands on", () => {
    const viaEnded = advanceFromHead(() => {
      act(() => {
        audioEngine.end();
      });
    });
    const viaNext = advanceFromHead(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next track" }));
    });

    expect(viaEnded).toBe("3");
    expect(viaEnded).toBe(viaNext);
  });

  test("auto-advance keys on identity when two rows share one preview asset", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${SHARED_CODE}`);
    const { container } = render(
      <ChartScreen
        charts={ADJACENCY_CHARTS}
        defaultCountryCode={SHARED_CODE}
      />,
    );
    // Play the tail, whose preview asset also belongs to the head. A
    // previewUrl-keyed walk would resolve the current track to the head and
    // wrongly re-advance; identity resolves it to the tail, which has no next.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Shared tail by Shared tail artist",
      }),
    );
    expect(playingRank(container)).toBe("2");

    act(() => {
      audioEngine.end();
    });

    expect(playingRank(container)).toBeNull();
  });

  test("ending the last playable track falls silent instead of wrapping to the head", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable tail by Tail artist",
      }),
    );
    expect(playingRank(container)).toBe("3");

    act(() => {
      audioEngine.end();
    });

    // step(1) finds no track past the tail, returns false, and advances nothing,
    // so the chart ends in silence rather than wrapping back to the head.
    expect(playingRank(container)).toBeNull();
  });
});
