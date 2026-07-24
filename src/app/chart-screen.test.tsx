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

// The landing country is rolled client-side after mount; pin the roll so each
// test controls where the screen lands when no ?cc= is present.
const landingPick = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/landing-code", () => ({
  randomCountryCode: () => landingPick.value,
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

// Plumbing only: pin the landing roll, then render without a ?cc= dependency.
function renderChartScreen(charts: ChartFile, landing: string) {
  landingPick.value = landing;
  return render(<ChartScreen charts={charts} />);
}

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
  const { container, unmount } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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

    renderChartScreen(CHARTS, CODE_BR);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("rolls a landing country and writes it to the URL when ?cc= is absent", () => {
    renderChartScreen(CHARTS, CODE_US);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("rolls a landing country for an invalid ?cc=", () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    renderChartScreen(CHARTS, CODE_US);

    expect(
      screen.getAllByText(COUNTRY_US.tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("canonicalizes an uppercase ?cc= in the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US.toUpperCase()}`);

    renderChartScreen(CHARTS, CODE_BR);

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

    renderChartScreen(CHARTS, CODE_BR);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_US);
  });

  test("publishes the rolled landing country to the globe when ?cc= is absent", () => {
    mockSearchParams.value = new URLSearchParams();

    renderChartScreen(CHARTS, CODE_BR);

    expect(globeChartStore.getState().selectedCountry).toBe(CODE_BR);
  });

  test("publishes read mode to the globe at full and clears it back at peek", () => {
    renderChartScreen(CHARTS, CODE_BR);

    expect(globeChartStore.getState().readMode).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse chart" }));
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("a settle raises a dismissed sheet back to peek", () => {
    renderChartScreen(CHARTS, CODE_BR);
    const sheet = screen.getByTestId("chart-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("a settle leaves an open sheet where it is", () => {
    renderChartScreen(CHARTS, CODE_BR);
    const sheet = screen.getByTestId("chart-sheet");

    expect(sheet.dataset.snap).toBe("peek");
    act(() => {
      globeChartStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("releases read mode when the chart unmounts", () => {
    const { unmount } = renderChartScreen(CHARTS, CODE_BR);
    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(globeChartStore.getState().readMode).toBe(true);

    unmount();
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("an edge-skip gesture latches the hint record's used flag", () => {
    localStorage.clear();
    renderChartScreen(CHARTS, CODE_BR);
    expect(readRecord().used).toBe(false);

    act(() => {
      globeChartStore.getState().signalSkip(1);
    });

    // The gesture alone latches it: no track is playing, so step declines the
    // skip, yet the teaching affordances still retire.
    expect(readRecord().used).toBe(true);
  });

  test("a settle never starts audio on its own", () => {
    renderChartScreen(CHARTS, CODE_BR);

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
    renderChartScreen(CHARTS, CODE_US);

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
    renderChartScreen(CHARTS, CODE_US);
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
    renderChartScreen(CHARTS, CODE_US);

    playFromTheChart();

    expect(screen.queryByTestId("edge-tap-badge")).toBeNull();
    expect(screen.queryByTestId("edge-chevrons")).toBeNull();
  });

  test("a track played mid-tour spends none of the hint's capped shows", () => {
    renderChartScreen(CHARTS, CODE_US);

    playFromTheChart();

    expect(readRecord().shows).toBe(0);
  });

  test("the cues surface once the tour has concluded", () => {
    writeTourRecord({ learned: [], shows: 0, dismissed: true });

    renderChartScreen(CHARTS, CODE_US);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    expect(cueDir(container)).toBeNull();
  });

  test("the next button publishes the forward direction", () => {
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable head by Head artist",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next track" }));

    expect(cueDir(container)).toBe("next");
  });

  test("the prev button publishes the backward direction", () => {
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Play preview of Playable tail by Tail artist",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));

    expect(cueDir(container)).toBe("prev");
  });

  test("auto-advance publishes the forward direction through the same step", () => {
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, SHARED_CODE);
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
    const { container } = renderChartScreen(ADJACENCY_CHARTS, ADJ_CODE);
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
    const rendered = renderChartScreen(charts, ADJ_CODE);
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
    const { container } = renderChartScreen(ROLL_CHARTS, ADJ_CODE);
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

// One country carrying one playlist chart, for the blocks below that exercise
// the rail, the URL, and the wait. The id is shared so a stubbed read matches
// whichever block is running.
const PL_ID = "pl.under-test";
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
            name: "A playlist chart",
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

/** The published shape a stubbed read returns for that playlist. */
function playlistPayload(): string {
  return JSON.stringify({
    id: PL_ID,
    lastUpdated: "2026-07-21T00:00:00.000Z",
    tracks: [PLAYLIST_TRACK],
  });
}

function playlistResponse(): Response {
  return new Response(playlistPayload(), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ChartScreen chart rail", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => playlistResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("lists every chart the country carries without fetching any of them", () => {
    renderChartScreen(chartsWithPlaylist(), RAIL_CODE);

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Top Songs",
      "A playlist chart",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("opening a playlist chart replaces the list with its tracks", async () => {
    const charts = chartsWithPlaylist();
    renderChartScreen(charts, RAIL_CODE);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "A playlist chart" }));
    });

    expect(screen.getAllByText(PLAYLIST_TRACK.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(songsTrack)).toBeNull();
  });

  test("returning to the songs chart costs no second read", async () => {
    const charts = chartsWithPlaylist();
    renderChartScreen(charts, RAIL_CODE);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "A playlist chart" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Top Songs" }));
    });

    expect(screen.getAllByText(songsTrack).length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  test("a country carrying no playlists renders no rail", () => {
    renderChartScreen(CHARTS, RAIL_CODE);

    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("ChartScreen playlist playback", () => {
  const PL_CODE = "zz";
  const PL_FIRST = "pl.first";
  const PL_SECOND = "pl.second";
  const PL_FIRST_LABEL = "First playlist";
  const PL_SECOND_LABEL = "Second playlist";
  const SONGS_ONLY = "Songs only";

  function playlistTrack(rank: number, name: string) {
    return {
      rank,
      name,
      artist: `${name} artist`,
      previewUrl: `https://example.com/${rank}-${name}.m4a`,
      artworkUrl: "https://example.com/pl.jpg",
      appleUrl: `https://music.apple.com/x/song?i=90${rank}${name.length}`,
    };
  }

  // Two tracks in the first chart so a step has somewhere to go inside it, one
  // in the second so its own end arrives immediately.
  const FIRST_HEAD = playlistTrack(1, "First head");
  const FIRST_TAIL = playlistTrack(2, "First tail");
  const SECOND_ONLY = playlistTrack(1, "Second only");
  const TRACKS_BY_CHART: Record<string, ReturnType<typeof playlistTrack>[]> = {
    [PL_FIRST]: [FIRST_HEAD, FIRST_TAIL],
    [PL_SECOND]: [SECOND_ONLY],
  };

  function playlistEntry(id: string, name: string) {
    return {
      id,
      name,
      appleUrl: `https://music.apple.com/x/playlist/${id}`,
      artworkUrl: "https://example.com/pl-art.jpg",
      genres: [],
      trackCount: TRACKS_BY_CHART[id].length,
    };
  }

  // A country carrying two playlist charts, plus a drawable country so the
  // cross-country roll past them has somewhere to land.
  const PLAYLIST_CHARTS: ChartFile = {
    lastUpdated: "2026-07-21T00:00:00Z",
    countries: {
      [PL_CODE]: {
        name: "Country under test",
        valid: true,
        tracks: [rollTrack(1, SONGS_ONLY, "https://example.com/songs.m4a")],
        playlists: [
          playlistEntry(PL_FIRST, PL_FIRST_LABEL),
          playlistEntry(PL_SECOND, PL_SECOND_LABEL),
        ],
        playlistsValid: true,
      },
      [DRAW_1]: rollCountry([
        rollTrack(1, LANDING_START, "https://example.com/landing.m4a"),
      ]),
    },
  };

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${PL_CODE}`);
    audioEngine.reset();
    globeChartStore.setState({
      selectedCountry: null,
      readMode: false,
      settleSignal: 0,
      skipIntent: { dir: 1, nonce: 0 },
      visited: new Set(),
    });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const id = decodeURIComponent(url.split("/").pop() ?? "");
        return new Response(
          JSON.stringify({
            id,
            lastUpdated: "2026-07-21T00:00:00.000Z",
            tracks: TRACKS_BY_CHART[id],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openChart(label: string) {
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: label }));
    });
  }

  function playPreview(name: string, artist: string) {
    fireEvent.click(
      screen.getByRole("button", {
        name: `Play preview of ${name} by ${artist}`,
      }),
    );
  }

  // The mini-player's own transport label, which names what is playing whatever
  // the list on screen shows. A row's label names the artist as well, so the
  // one without is the mini-player's.
  const MINI_TRANSPORT = /^(Play|Pause) preview of (?!.* by ).+$/;

  function miniPlayerTrackName(): string {
    const label =
      screen
        .getByRole("button", { name: MINI_TRANSPORT })
        .getAttribute("aria-label") ?? "";
    return label.replace(/^(Play|Pause) preview of /, "");
  }

  test("a track of a playlist chart plays through the preview pipeline", async () => {
    const { container } = renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    await openChart(PL_FIRST_LABEL);

    playPreview(FIRST_HEAD.name, FIRST_HEAD.artist);

    expect(playingRank(container)).toBe("1");
  });

  test("next moves within the playing chart", async () => {
    const { container } = renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    await openChart(PL_FIRST_LABEL);
    playPreview(FIRST_HEAD.name, FIRST_HEAD.artist);

    fireEvent.click(screen.getByRole("button", { name: "Next track" }));

    expect(playingRank(container)).toBe("2");
    expect(miniPlayerTrackName()).toBe(FIRST_TAIL.name);
  });

  test("browsing another chart leaves playback in the one it started from", async () => {
    const { container } = renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    await openChart(PL_FIRST_LABEL);
    playPreview(FIRST_HEAD.name, FIRST_HEAD.artist);

    await openChart("Top Songs");

    expect(playingRank(container)).toBeNull();
    expect(miniPlayerTrackName()).toBe(FIRST_HEAD.name);

    fireEvent.click(screen.getByRole("button", { name: "Next track" }));

    expect(miniPlayerTrackName()).toBe(FIRST_TAIL.name);
    expect(playingRank(container)).toBeNull();
  });

  test("the end of a playlist chart continues into the country's next one", async () => {
    renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    await openChart(PL_FIRST_LABEL);
    playPreview(FIRST_TAIL.name, FIRST_TAIL.artist);

    await act(async () => {
      audioEngine.end();
    });

    expect(miniPlayerTrackName()).toBe(SECOND_ONLY.name);
    expect(globeChartStore.getState().selectedCountry).not.toBe(DRAW_1);
    expect(
      screen
        .getByRole("tab", { name: PL_SECOND_LABEL })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("a country whose playlist charts are exhausted rolls into another country", async () => {
    renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    await openChart(PL_SECOND_LABEL);
    playPreview(SECOND_ONLY.name, SECOND_ONLY.artist);

    await act(async () => {
      audioEngine.end();
    });

    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_1);
    expect(miniPlayerTrackName()).toBe(LANDING_START);
  });

  test("the songs chart's end still rolls out of a country carrying playlists", async () => {
    renderChartScreen(PLAYLIST_CHARTS, PL_CODE);
    playPreview(SONGS_ONLY, `${SONGS_ONLY} artist`);

    await act(async () => {
      audioEngine.end();
    });

    expect(globeChartStore.getState().selectedCountry).toBe(DRAW_1);
    expect(miniPlayerTrackName()).toBe(LANDING_START);
  });
});

describe("ChartScreen chart in the URL", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => playlistResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    replaceState.mockRestore();
  });

  test("names the chart in the URL once one is opened", async () => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    renderChartScreen(chartsWithPlaylist(), RAIL_CODE);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "A playlist chart" }));
    });

    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      `?cc=${RAIL_CODE}&chart=${PL_ID}`,
    );
  });

  test("a link naming a chart opens it", async () => {
    mockSearchParams.value = new URLSearchParams(
      `cc=${RAIL_CODE}&chart=${PL_ID}`,
    );
    renderChartScreen(chartsWithPlaylist(), RAIL_CODE);

    await act(async () => {});

    expect(screen.getAllByText(PLAYLIST_TRACK.name).length).toBeGreaterThan(0);
  });

  test("a chart the country does not carry falls back to its songs chart", async () => {
    mockSearchParams.value = new URLSearchParams(
      `cc=${RAIL_CODE}&chart=pl.elsewhere`,
    );
    const charts = chartsWithPlaylist();
    renderChartScreen(charts, RAIL_CODE);

    await act(async () => {});

    expect(
      screen.getAllByText(charts.countries[RAIL_CODE].tracks[0].name).length,
    ).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenLastCalledWith(null, "", `?cc=${RAIL_CODE}`);
  });

  test("a URL already naming the open chart is left alone", async () => {
    mockSearchParams.value = new URLSearchParams(
      `cc=${RAIL_CODE}&chart=${PL_ID}`,
    );
    renderChartScreen(chartsWithPlaylist(), RAIL_CODE);

    await act(async () => {});

    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("ChartScreen while a chart is read", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("the outgoing chart stays on screen and is marked as waiting", async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(playlistResponse());
          }),
      ),
    );
    const charts = chartsWithPlaylist();
    const { container } = renderChartScreen(charts, RAIL_CODE);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    fireEvent.click(screen.getByRole("tab", { name: "A playlist chart" }));

    expect(container.querySelector("[data-chart-waiting]")).not.toBeNull();
    expect(screen.getAllByText(songsTrack).length).toBeGreaterThan(0);

    await act(async () => {
      release?.();
    });

    expect(container.querySelector("[data-chart-waiting]")).toBeNull();
  });

  test("a chart that fails to load leaves the list and stops offering itself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    const charts = chartsWithPlaylist();
    const { container } = renderChartScreen(charts, RAIL_CODE);
    const songsTrack = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "A playlist chart" }));
    });

    expect(screen.getAllByText(songsTrack).length).toBeGreaterThan(0);
    expect(
      (
        screen.getByRole("tab", {
          name: "A playlist chart",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(container.querySelector("[data-chart-waiting]")).toBeNull();
  });
});

describe("ChartScreen rail and panel", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("the track list is the panel the open chart's tab controls", () => {
    renderChartScreen(chartsWithPlaylist(), RAIL_CODE);

    const panel = screen.getByRole("tabpanel");
    const open = screen.getByRole("tab", { selected: true });
    expect(panel.getAttribute("aria-labelledby")).toBe(open.id);
    expect(open.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.tabIndex).toBe(0);
  });

  test("a country with no rail exposes no panel", () => {
    renderChartScreen(CHARTS, RAIL_CODE);

    expect(screen.queryByRole("tabpanel")).toBeNull();
  });
});

describe("ChartScreen deeper rows", () => {
  const DEEP_TRACK = {
    rank: 26,
    name: "Only past the eager rows",
    artist: "A deeper artist",
    previewUrl: null,
    artworkUrl: "https://art.test/deep.jpg",
    appleUrl: "https://music.apple.com/br/song/26?i=26",
    spotifyUrl: "https://open.spotify.com/search/deep",
  };

  /** Captures the observer so a test can decide when the list is read that far. */
  function stubObserver(): { reach: () => void } {
    let fire: (() => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          fire = () =>
            this.cb(
              [
                {
                  isIntersecting: true,
                  target: el,
                } as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver,
            );
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
    return { reach: () => fire?.() };
  }

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${RAIL_CODE}`);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("landing on a country reads nothing deeper", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    stubObserver();

    renderChartScreen(CHARTS, RAIL_CODE);

    expect(spy).not.toHaveBeenCalled();
  });

  test("reading to the end of the chart brings in the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: RAIL_CODE,
              lastUpdated: "2026-07-22T00:00:00.000Z",
              tracks: [DEEP_TRACK],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const { reach } = stubObserver();
    renderChartScreen(CHARTS, RAIL_CODE);

    expect(screen.queryByText(DEEP_TRACK.name)).toBeNull();

    await act(async () => {
      reach();
    });

    expect(screen.getAllByText(DEEP_TRACK.name).length).toBeGreaterThan(0);
  });

  test("a deeper chart that will not load leaves the rows already read", async () => {
    vi.stubGlobal(
      "fetch",
      // The store failing, not a chart that simply ends: 404 is the latter, and
      // leaves the list as a chart read to its end rather than a broken one.
      vi.fn(async () => new Response("", { status: 502 })),
    );
    const { reach } = stubObserver();
    const charts = CHARTS;
    renderChartScreen(charts, RAIL_CODE);
    const eager = charts.countries[RAIL_CODE].tracks[0].name;

    await act(async () => {
      reach();
    });

    expect(screen.getAllByText(eager).length).toBeGreaterThan(0);
    expect(screen.queryByText(DEEP_TRACK.name)).toBeNull();
  });
});

describe("ChartScreen stepping past the eager rows", () => {
  const DEEP_CODE = "dp";

  function deepTrack(rank: number, spread: number): Track {
    return {
      rank,
      name: `Deep ${rank}`,
      artist: `Deep artist ${rank}`,
      previewUrl: `https://example.com/deep-${rank}.m4a`,
      artworkUrl: "https://example.com/deep.jpg",
      appleUrl: `https://music.apple.com/x/deep-${rank}`,
      spotifyUrl: `https://open.spotify.com/x/deep-${rank}`,
      spread,
    };
  }

  // A country whose chart runs past what travelled: ranks 1 and 2 eagerly, 3 and
  // 4 only once read. Spread is set so Only here keeps 2 and 4, which are on
  // either side of the boundary.
  const AWAY_CODE = "aw";
  const DEEP_CHARTS: ChartFile = {
    lastUpdated: "2026-07-22T00:00:00Z",
    countries: {
      [DEEP_CODE]: {
        name: "Deep country",
        valid: true,
        tracks: [deepTrack(1, 7), deepTrack(2, 1)],
      },
      // Somewhere else to stand while the first country's chart plays on.
      [AWAY_CODE]: {
        name: "Away country",
        valid: true,
        tracks: [deepTrack(1, 3)],
      },
    },
  };
  const TAIL_ROWS = [deepTrack(3, 5), deepTrack(4, 1)];

  function stubObserver(): { reach: () => void } {
    let fire: (() => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          fire = () =>
            this.cb(
              [
                {
                  isIntersecting: true,
                  target: el,
                } as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver,
            );
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
    return { reach: () => fire?.() };
  }

  function stubTailFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: DEEP_CODE,
              lastUpdated: "2026-07-22T00:00:00.000Z",
              tracks: TAIL_ROWS,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  }

  function play(name: string, artist: string) {
    fireEvent.click(
      screen.getByRole("button", {
        name: `Play preview of ${name} by ${artist}`,
      }),
    );
  }

  function next() {
    fireEvent.click(screen.getByRole("button", { name: "Next track" }));
  }

  function prev() {
    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));
  }

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${DEEP_CODE}`);
    audioEngine.reset();
    stubTailFetch();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("next continues into the rows read past the payload", async () => {
    const { reach } = stubObserver();
    const { container } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    play("Deep 2", "Deep artist 2");
    expect(playingRank(container)).toBe("2");

    next();

    expect(playingRank(container)).toBe("3");
  });

  test("next walks the mode on screen, not the rows it hides", async () => {
    const { reach } = stubObserver();
    const { container } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    fireEvent.click(screen.getByRole("button", { name: "Only here" }));
    play("Deep 2", "Deep artist 2");

    next();

    // Rank 3 is on the chart but not in this mode, so the step passes over it.
    expect(playingRank(container)).toBe("4");
  });

  test("a track the mode hides still steps to the mode's next row", async () => {
    const { reach } = stubObserver();
    const { container } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    play("Deep 3", "Deep artist 3");

    fireEvent.click(screen.getByRole("button", { name: "Only here" }));
    next();

    // Rank 3 is filtered away, but it is still where the listener is, so the
    // step moves on within Only here rather than reading as the chart's end and
    // rolling them out of the country.
    expect(playingRank(container)).toBe("4");
  });

  test("the mode still governs a chart playing on in a country left behind", async () => {
    const { reach } = stubObserver();
    const { rerender } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    fireEvent.click(screen.getByRole("button", { name: "Only here" }));
    play("Deep 2", "Deep artist 2");

    // Stand somewhere else; the chart playing is the one left behind.
    mockSearchParams.value = new URLSearchParams(`cc=${AWAY_CODE}`);
    rerender(<ChartScreen charts={DEEP_CHARTS} />);
    expect(screen.getByText("Away country")).not.toBeNull();

    next();

    // The playing row is no longer on screen, so the mini-player is what names
    // it. Rank 3 is hidden by the mode the listener still has on, so the step
    // lands on 4 exactly as it would have without moving.
    expect(screen.queryByText("Deep 4")).not.toBeNull();
    expect(screen.queryByText("Deep 3")).toBeNull();
  });

  test("changing the mode elsewhere leaves the playing chart in its own", async () => {
    const { reach } = stubObserver();
    const { rerender } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    fireEvent.click(screen.getByRole("button", { name: "Only here" }));
    play("Deep 2", "Deep artist 2");

    mockSearchParams.value = new URLSearchParams(`cc=${AWAY_CODE}`);
    rerender(<ChartScreen charts={DEEP_CHARTS} />);
    // Re-aim what is on screen; what is playing was started in the other mode.
    fireEvent.click(screen.getByRole("button", { name: "Most played" }));
    next();

    expect(screen.queryByText("Deep 4")).not.toBeNull();
    expect(screen.queryByText("Deep 3")).toBeNull();
  });

  test("switching mode on the playing chart re-aims what next walks", async () => {
    const { reach } = stubObserver();
    const { container } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    fireEvent.click(screen.getByRole("button", { name: "Only here" }));
    play("Deep 2", "Deep artist 2");

    // Back to the whole chart, still looking at the chart that is playing.
    fireEvent.click(screen.getByRole("button", { name: "Most played" }));
    next();

    // Rank 3 is listed again, so it is what next reaches.
    expect(playingRank(container)).toBe("3");
  });

  test("stepping back and forth stays on the mode in front of the listener", async () => {
    const { reach } = stubObserver();
    const { container } = renderChartScreen(DEEP_CHARTS, DEEP_CODE);
    await act(async () => {
      reach();
    });
    play("Deep 1", "Deep artist 1");
    fireEvent.click(screen.getByRole("button", { name: "Only here" }));

    next();
    expect(playingRank(container)).toBe("2");
    next();
    expect(playingRank(container)).toBe("4");
    prev();
    expect(playingRank(container)).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Most played" }));
    next();

    expect(playingRank(container)).toBe("3");
  });
});
