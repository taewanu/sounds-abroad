import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { readRecord } from "@/components/globe/edge-hint-record";
import { writeRecord as writeTourRecord } from "@/components/tour/tour-record-store";
import { CHARTS, CODE_BR, CODE_US, COUNTRY_US } from "@/lib/__fixtures__";
import type { AudioEngine } from "@/lib/audio-engine";
import type { ChartFile, Country, Track } from "@/lib/chart-schema";
import { COUNTRIES } from "@/lib/countries";
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

// The end-of-chart roll draws from the full country universe, so a roll target
// must be keyed by a real country code. With no visits every pool weight is 1
// and r=0 draws the first non-excluded pool entry, so pinning Math.random to 0
// makes each landing deterministic: the first universe entry, then (once it is
// excluded by a failed attempt) the next, and so on.
const DRAW_1 = COUNTRIES[0].code;
const DRAW_2 = COUNTRIES[1].code;
const DRAW_3 = COUNTRIES[2].code;

// No `i=` id on appleUrl, so track identity falls back to artist+name; unique
// names keep every fixture track distinct across countries.
function rollTrack(
  rank: number,
  name: string,
  previewUrl: string | null,
): Track {
  return {
    rank,
    name,
    artist: `${name} artist`,
    previewUrl,
    artworkUrl: "https://example.com/roll.jpg",
    appleUrl: "https://music.apple.com/x/roll",
    spotifyUrl: "https://open.spotify.com/x/roll",
  };
}

function rollCountry(tracks: Track[]): Country {
  return { name: "Roll fixture chart", valid: true, tracks };
}

// A leading preview-less track, so a roll must land on the first *playable*
// track, not row one.
const LANDING_START = "Landing start";
const ROLL_CHARTS: ChartFile = {
  ...ADJACENCY_CHARTS,
  countries: {
    ...ADJACENCY_CHARTS.countries,
    [DRAW_1]: rollCountry([
      rollTrack(1, "Landing gap", null),
      rollTrack(2, LANDING_START, "https://example.com/landing-2.m4a"),
      rollTrack(3, "Landing follow-up", "https://example.com/landing-3.m4a"),
    ]),
  },
};

// The first draw has no playable track, so the roll must redraw past it.
const REDRAW_START = "Redraw start";
const REDRAW_CHARTS: ChartFile = {
  ...ADJACENCY_CHARTS,
  countries: {
    ...ADJACENCY_CHARTS.countries,
    [DRAW_1]: rollCountry([
      rollTrack(1, "Silent one", null),
      rollTrack(2, "Silent two", null),
    ]),
    [DRAW_2]: rollCountry([
      rollTrack(1, REDRAW_START, "https://example.com/redraw-1.m4a"),
    ]),
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

  test("an edge-skip gesture latches the hint record's used flag", () => {
    localStorage.clear();
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    expect(readRecord().used).toBe(false);

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    // The gesture alone latches it: no track is playing, so step declines the
    // skip, yet the teaching affordances still retire.
    expect(readRecord().used).toBe(true);
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

describe("ChartScreen edge-skip cues", () => {
  const playable = COUNTRY_US.tracks.find((t) => t.previewUrl)!;

  function playFromTheChart() {
    fireEvent.click(
      screen.getByRole("button", {
        name: `Play preview of ${playable.name} by ${playable.artist}`,
      }),
    );
  }

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    localStorage.clear();
    audioEngine.reset();
    // The cues are touch-only; without a coarse pointer they'd stay hidden for
    // that reason instead of the one under test.
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("coarse"),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("playing a track while the tour still has gestures to teach surfaces no cue", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    playFromTheChart();

    expect(screen.queryByTestId("edge-tap-badge")).toBeNull();
    expect(screen.queryByTestId("edge-chevrons")).toBeNull();
  });

  test("a track played mid-tour spends none of the hint's capped shows", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    playFromTheChart();

    expect(readRecord().shows).toBe(0);
  });

  test("the cues surface once the tour has concluded", () => {
    writeTourRecord({ learned: [], shows: 0, dismissed: true });

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);
    playFromTheChart();

    expect(screen.getByTestId("edge-tap-badge")).toBeTruthy();
    expect(screen.getByTestId("edge-chevrons")).toBeTruthy();
  });
});

describe("ChartScreen directional cue", () => {
  function cueDir(container: HTMLElement): string | null {
    return (
      container
        .querySelector("[data-track-change]")
        ?.getAttribute("data-track-change") ?? null
    );
  }

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${ADJ_CODE}`);
    audioEngine.reset();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starting playback carries no directional cue", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    expect(cueDir(container)).toBeNull();
  });

  test("the next button publishes the forward direction", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next track" }));

    expect(cueDir(container)).toBe("next");
  });

  test("the prev button publishes the backward direction", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable tail by Tail artist",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));

    expect(cueDir(container)).toBe("prev");
  });

  test("auto-advance publishes the forward direction through the same step", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    act(() => {
      audioEngine.end();
    });

    expect(cueDir(container)).toBe("next");
  });

  test("a globe skip-intent publishes its direction through the same step", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    expect(cueDir(container)).toBe("next");
  });

  test("a direct row tap changes the track without a directional cue", () => {
    const { container } = render(
      <ChartScreen charts={ADJACENCY_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable tail by Tail artist",
      }),
    );

    expect(cueDir(container)).toBeNull();
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

    // With no other playable chart in the file the roll dead-stops, so the
    // chart ends in silence rather than wrapping back to the head.
    expect(playingRank(container)).toBeNull();
  });
});

describe("ChartScreen end-of-chart roll", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${ADJ_CODE}`);
    audioEngine.reset();
    globeChartStore.setState({
      selectedCountry: null,
      readMode: false,
      settleSignal: 0,
      skipIntent: { dir: 1, nonce: 0 },
      visited: new Set(),
    });
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Render the chart and start its last playable track, the seat every roll
  // begins from.
  function playLastPlayable(charts: ChartFile) {
    const rendered = render(
      <ChartScreen charts={charts} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable tail by Tail artist",
      }),
    );
    return rendered;
  }

  function flashIcon(container: HTMLElement): Element | null {
    return container.querySelector(".skip-flash svg");
  }

  test("ending the last playable track rolls into a drawn country and plays its first playable", () => {
    const { container } = playLastPlayable(ROLL_CHARTS);

    act(() => {
      audioEngine.end();
    });

    expect(screen.getByText(LANDING_START)).toBeTruthy();
    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_1);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${DRAW_1}`);
    const icon = flashIcon(container);
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("class") ?? "").not.toContain("-scale-x-100");
  });

  test("pressing next at the last playable rolls the same way the ended signal does", () => {
    playLastPlayable(ROLL_CHARTS);
    const next = screen.getByRole("button", {
      name: "Next track",
    }) as HTMLButtonElement;

    expect(next.disabled).toBe(false);
    fireEvent.click(next);

    expect(screen.getByText(LANDING_START)).toBeTruthy();
    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_1);
  });

  test("a roll leaves a dismissed sheet closed, unlike a plain settle", () => {
    playLastPlayable(ROLL_CHARTS);
    const sheet = screen.getByTestId("chart-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      audioEngine.end();
    });
    act(() => {
      globeChartStore.getState().signalSettle();
    });

    expect(screen.getByText(LANDING_START)).toBeTruthy();
    expect(sheet.dataset.snap).toBe("closed");
  });

  test("the roll's resurface guard is one-shot: a later settle raises again", () => {
    playLastPlayable(ROLL_CHARTS);
    const sheet = screen.getByTestId("chart-sheet");
    fireEvent.keyDown(document, { key: "Escape" });

    act(() => {
      audioEngine.end();
    });
    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("an edge-tap skip intent at the last playable rolls with a single forward cue", () => {
    const { container } = playLastPlayable(ROLL_CHARTS);

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    expect(screen.getByText(LANDING_START)).toBeTruthy();
    expect(container.querySelectorAll(".skip-flash")).toHaveLength(1);
  });

  test("an edge-tap skip intent mid-chart still advances and flashes", () => {
    const { container } = render(
      <ChartScreen charts={ROLL_CHARTS} defaultCountryCode={ADJ_CODE} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    expect(playingRank(container)).toBe("3");
    expect(container.querySelectorAll(".skip-flash")).toHaveLength(1);
  });

  test("a drawn chart with no playable track is redrawn until one can play", () => {
    playLastPlayable(REDRAW_CHARTS);

    act(() => {
      audioEngine.end();
    });

    expect(screen.getByText(REDRAW_START)).toBeTruthy();
    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_2);
  });

  test("when every redraw fails the chart dead-stops as before", () => {
    const { container } = playLastPlayable(ADJACENCY_CHARTS);

    act(() => {
      audioEngine.end();
    });

    expect(playingRank(container)).toBeNull();
    expect(globeChartStore.getState().selectedCountry).toBe(ADJ_CODE);
    expect(replaceState).not.toHaveBeenCalled();
    expect(container.querySelector(".skip-flash")).toBeNull();
  });

  test("prev at the rolled-in first playable returns to the origin's last playable with a reverse cue", () => {
    const { container } = playLastPlayable(ROLL_CHARTS);
    act(() => {
      audioEngine.end();
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));

    expect(playingRank(container)).toBe("3");
    expect(globeChartStore.getState().selectedCountry).toBe(ADJ_CODE);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${ADJ_CODE}`);
    expect(flashIcon(container)!.getAttribute("class") ?? "").toContain(
      "-scale-x-100",
    );
  });

  test("rolling forward again after a back-roll performs a fresh draw", () => {
    playLastPlayable(ROLL_CHARTS);
    act(() => {
      audioEngine.end();
    });
    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));

    act(() => {
      audioEngine.end();
    });

    expect(screen.getByText(LANDING_START)).toBeTruthy();
    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_1);
  });

  test("a manual country selection discards the back-roll return path", () => {
    playLastPlayable(ROLL_CHARTS);
    act(() => {
      audioEngine.end();
    });

    act(() => {
      globeChartStore.getState().setSelectedCountry(DRAW_3);
    });

    const prev = screen.getByRole("button", {
      name: "Previous track",
    }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });
});

describe("ChartScreen chart rail", () => {
  const PL_ID = "pl.rail";
  const RAIL_CODE = "br";

  function chartsWithPlaylist(): ChartFile {
    const base = CHARTS.countries[RAIL_CODE];
    return {
      ...CHARTS,
      countries: {
        ...CHARTS.countries,
        [RAIL_CODE]: {
          ...base,
          playlists: [
            {
              id: PL_ID,
              name: "Pagode 2026",
              appleUrl: `https://music.apple.com/br/playlist/${PL_ID}`,
              artworkUrl: "https://art.test/p.jpg",
              genres: [],
              trackCount: 1,
            },
          ],
          playlistsValid: true,
        },
      },
    };
  }

  const PLAYLIST_TRACK = {
    rank: 1,
    name: "Only on the playlist",
    artist: "Playlist artist",
    previewUrl: null,
    artworkUrl: "https://art.test/t.jpg",
    appleUrl: "https://music.apple.com/br/song/x?i=99",
  };

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: PL_ID,
              lastUpdated: "2026-07-21T00:00:00.000Z",
              tracks: [PLAYLIST_TRACK],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("lists every chart the country carries without fetching any of them", () => {
    render(
      <ChartScreen
        charts={chartsWithPlaylist()}
        defaultCountryCode={RAIL_CODE}
      />,
    );

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Top Songs",
      "Pagode 2026",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("opening a playlist chart replaces the list with its tracks", async () => {
    const charts = chartsWithPlaylist();
    render(<ChartScreen charts={charts} defaultCountryCode={RAIL_CODE} />);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Pagode 2026" }));
    });

    expect(screen.getAllByText(PLAYLIST_TRACK.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(songsTrack)).toBeNull();
  });

  test("returning to the songs chart costs no second read", async () => {
    const charts = chartsWithPlaylist();
    render(<ChartScreen charts={charts} defaultCountryCode={RAIL_CODE} />);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Pagode 2026" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Top Songs" }));
    });

    expect(screen.getAllByText(songsTrack).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  test("a country carrying no playlists renders no rail", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={RAIL_CODE} />);

    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
