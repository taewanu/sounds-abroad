import { describe, expect, test } from "vitest";

import type { ChartMode } from "./chart-mode";
import { SONGS_CHART } from "./chart-ref";
import type { Country, Playlist, Track } from "./chart-schema";
import {
  backRollTarget,
  firstPlayable,
  landingTrack,
  MAX_ROLL_ATTEMPTS,
  planChartContinuation,
  planRoll,
  playlistsAfter,
  recordAfterSelection,
  type RollRecord,
} from "./end-of-chart-roll";

function makeTrack(
  rank: number,
  previewUrl: string | null,
  appleUrl = `https://music.apple.com/x?i=${rank}`,
  spread?: number,
): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl,
    spotifyUrl: "https://open.spotify.com/search/x",
    spread,
  };
}

// A track no other country's chart carries, so only here keeps it.
function exclusive(rank: number, previewUrl: string | null): Track {
  return makeTrack(rank, previewUrl, `https://music.apple.com/x?i=${rank}`, 1);
}

// A track several countries carry, so only here filters it away.
function shared(rank: number, previewUrl: string | null): Track {
  return makeTrack(rank, previewUrl, `https://music.apple.com/x?i=${rank}`, 6);
}

function makeCountry(tracks: Track[]): Country {
  return { name: "Chart under test", valid: true, tracks };
}

// A draw stub that answers from a fixed queue and records the exclusion list
// passed to each attempt, so tests can assert what a redraw may not repeat.
function queuedDraw(codes: string[]) {
  const excludeSeen: string[][] = [];
  let call = 0;
  const draw = (exclude: readonly string[]) => {
    excludeSeen.push([...exclude]);
    return codes[Math.min(call++, codes.length - 1)];
  };
  return { draw, excludeSeen };
}

const ORIGIN_CODE = "aa";

describe("firstPlayable", () => {
  test("skips leading tracks with no preview", () => {
    const leadingGap = makeTrack(1, null);
    const target = makeTrack(2, "https://example.com/2.m4a");
    const later = makeTrack(3, "https://example.com/3.m4a");

    expect(firstPlayable([leadingGap, target, later])).toBe(target);
  });

  test("returns null when no track can play", () => {
    expect(firstPlayable([makeTrack(1, null), makeTrack(2, null)])).toBeNull();
    expect(firstPlayable([])).toBeNull();
  });
});

describe("landingTrack", () => {
  test("takes the chart's first playable in most played", () => {
    const head = shared(1, "https://example.com/1.m4a");
    const country = makeCountry([
      head,
      exclusive(2, "https://example.com/2.m4a"),
    ]);

    expect(landingTrack(country, "most_played", null)).toBe(head);
  });

  test("passes over a track the mode does not list", () => {
    const listed = exclusive(3, "https://example.com/3.m4a");
    const country = makeCountry([
      shared(1, "https://example.com/1.m4a"),
      shared(2, "https://example.com/2.m4a"),
      listed,
    ]);

    expect(landingTrack(country, "only_here", null)).toBe(listed);
  });

  test("passes over a listed track that cannot play", () => {
    const playable = exclusive(2, "https://example.com/2.m4a");
    const country = makeCountry([exclusive(1, null), playable]);

    expect(landingTrack(country, "only_here", null)).toBe(playable);
  });

  test("reaches a seat only the deeper rows carry", () => {
    const deep = exclusive(30, "https://example.com/30.m4a");
    const country = makeCountry([shared(1, "https://example.com/1.m4a")]);

    expect(landingTrack(country, "only_here", null)).toBeNull();
    expect(landingTrack(country, "only_here", [deep])).toBe(deep);
  });

  test("keeps the seat the payload already answers, deeper rows or not", () => {
    const early = exclusive(2, "https://example.com/2.m4a");
    const country = makeCountry([
      shared(1, "https://example.com/1.m4a"),
      early,
    ]);
    const deep = exclusive(30, "https://example.com/30.m4a");

    expect(landingTrack(country, "only_here", [deep])).toBe(early);
  });

  test("returns null when the mode lists nothing playable", () => {
    expect(
      landingTrack(
        makeCountry([shared(1, "https://example.com/1.m4a")]),
        "only_here",
        [],
      ),
    ).toBeNull();
    expect(
      landingTrack(makeCountry([exclusive(1, null)]), "only_here", []),
    ).toBeNull();
    expect(landingTrack(undefined, "only_here", null)).toBeNull();
  });

  test("excludes a track the crawl never counted, whichever mode asks", () => {
    const uncounted = makeCountry([makeTrack(1, "https://example.com/1.m4a")]);

    expect(landingTrack(uncounted, "only_here", null)).toBeNull();
    expect(landingTrack(uncounted, "most_played", null)).not.toBeNull();
  });
});

describe("planRoll", () => {
  const target = makeTrack(2, "https://example.com/2.m4a");

  // Seats by country code, so the draw loop is exercised without restating how
  // a seat is read: that is landingTrack's own contract, tested above.
  function seatsAt(seats: Record<string, Track>) {
    return (code: string) => seats[code] ?? null;
  }

  test("lands on the first draw when that country offers a seat", () => {
    const { draw, excludeSeen } = queuedDraw(["bb"]);

    const landing = planRoll(ORIGIN_CODE, seatsAt({ bb: target }), draw);

    expect(landing).toEqual({ code: "bb", track: target });
    expect(excludeSeen).toEqual([[ORIGIN_CODE]]);
  });

  test("redraws past a country offering no seat, excluding the failed candidate", () => {
    const { draw, excludeSeen } = queuedDraw(["bb", "cc"]);

    const landing = planRoll(ORIGIN_CODE, seatsAt({ cc: target }), draw);

    expect(landing?.code).toBe("cc");
    expect(excludeSeen).toEqual([[ORIGIN_CODE], [ORIGIN_CODE, "bb"]]);
  });

  test("every redraw excludes the origin and all earlier failed candidates", () => {
    const { draw, excludeSeen } = queuedDraw(["bb", "cc", "dd"]);

    planRoll(ORIGIN_CODE, seatsAt({}), draw);

    expect(excludeSeen).toEqual([
      [ORIGIN_CODE],
      [ORIGIN_CODE, "bb"],
      [ORIGIN_CODE, "bb", "cc"],
    ]);
  });

  test("stops after the attempt bound and falls back to a dead stop", () => {
    const { draw, excludeSeen } = queuedDraw(["bb", "cc", "dd", "ee"]);

    const landing = planRoll(ORIGIN_CODE, seatsAt({}), draw);

    expect(landing).toBeNull();
    expect(excludeSeen).toHaveLength(MAX_ROLL_ATTEMPTS);
  });
});

function makePlaylist(id: string): Playlist {
  return {
    id,
    name: `Chart ${id}`,
    appleUrl: `https://music.apple.com/x/playlist/${id}`,
    artworkUrl: "https://example.com/art.jpg",
    genres: [],
    trackCount: 1,
  };
}

describe("playlistsAfter", () => {
  const country: Country = {
    ...makeCountry([makeTrack(1, "https://example.com/1.m4a")]),
    playlists: ["pl.a", "pl.b", "pl.c"].map(makePlaylist),
  };

  test("returns the country's later charts in published order", () => {
    expect(playlistsAfter(country, "pl.a")).toEqual(["pl.b", "pl.c"]);
  });

  test("returns nothing at the last chart the country carries", () => {
    expect(playlistsAfter(country, "pl.c")).toEqual([]);
  });

  test("returns nothing for the songs chart, whose end leaves the country", () => {
    expect(playlistsAfter(country, SONGS_CHART)).toEqual([]);
  });

  test("returns nothing for a chart the country no longer advertises", () => {
    expect(playlistsAfter(country, "pl.gone")).toEqual([]);
    expect(playlistsAfter(makeCountry([]), "pl.a")).toEqual([]);
    expect(playlistsAfter(undefined, "pl.a")).toEqual([]);
  });
});

describe("planChartContinuation", () => {
  const silent = [makeTrack(1, null)];
  const playable = [
    makeTrack(1, null),
    makeTrack(2, "https://example.com/2.m4a"),
  ];

  test("lands on the first candidate that can play, at its first playable", async () => {
    const read = async (ref: string) => (ref === "pl.a" ? playable : silent);

    expect(await planChartContinuation(["pl.a", "pl.b"], read)).toEqual({
      ref: "pl.a",
      track: playable[1],
    });
  });

  test("passes over a candidate with nothing playable", async () => {
    const read = async (ref: string) => (ref === "pl.a" ? silent : playable);

    expect(await planChartContinuation(["pl.a", "pl.b"], read)).toEqual({
      ref: "pl.b",
      track: playable[1],
    });
  });

  test("passes over a candidate that cannot be read", async () => {
    const read = async (ref: string) => {
      if (ref === "pl.a") throw new Error("unreadable");
      return playable;
    };

    expect(await planChartContinuation(["pl.a", "pl.b"], read)).toEqual({
      ref: "pl.b",
      track: playable[1],
    });
  });

  test("returns null once every candidate is spent", async () => {
    const read = async () => silent;

    expect(await planChartContinuation(["pl.a", "pl.b"], read)).toBeNull();
    expect(await planChartContinuation([], read)).toBeNull();
  });
});

describe("backRollTarget", () => {
  const originLast = makeTrack(9, "https://example.com/9.m4a");
  const rolledSeat = makeTrack(2, "https://example.com/r2.m4a");
  const rolledLater = makeTrack(3, "https://example.com/r3.m4a");
  const seatOf = (code: string) => (code === "bb" ? rolledSeat : null);
  const record: RollRecord = {
    originCountryCode: ORIGIN_CODE,
    originChartRef: SONGS_CHART,
    originTrack: originLast,
    rolledToCode: "bb",
  };

  test("returns the origin at the seat the roll landed on", () => {
    expect(
      backRollTarget(record, rolledSeat, "bb", SONGS_CHART, seatOf),
    ).toEqual({
      countryCode: ORIGIN_CODE,
      chartRef: SONGS_CHART,
      track: originLast,
    });
  });

  test("keeps the clamp past the seat the roll landed on", () => {
    expect(
      backRollTarget(record, rolledLater, "bb", SONGS_CHART, seatOf),
    ).toBeNull();
  });

  test("keeps the clamp when playback is not on the rolled-in chart", () => {
    expect(
      backRollTarget(record, rolledSeat, "cc", SONGS_CHART, seatOf),
    ).toBeNull();
    expect(
      backRollTarget(record, originLast, ORIGIN_CODE, SONGS_CHART, seatOf),
    ).toBeNull();
  });

  test("keeps the clamp with no record or nothing playing", () => {
    expect(
      backRollTarget(null, rolledSeat, "bb", SONGS_CHART, seatOf),
    ).toBeNull();
    expect(backRollTarget(record, null, "bb", SONGS_CHART, seatOf)).toBeNull();
  });

  test("keeps the clamp once playback has moved to another of the country's charts", () => {
    expect(
      backRollTarget(record, rolledSeat, "bb", "pl.other", seatOf),
    ).toBeNull();
  });

  test("keeps the clamp when the rolled-in chart offers no seat at all", () => {
    expect(
      backRollTarget(record, rolledSeat, "bb", SONGS_CHART, () => null),
    ).toBeNull();
  });

  test("reads the seat from the same mode the roll landed in", () => {
    const country = makeCountry([
      shared(1, "https://example.com/r1.m4a"),
      exclusive(2, "https://example.com/r2.m4a"),
    ]);
    const onlyHereSeat = landingTrack(country, "only_here", null);
    const chartOf = (mode: ChartMode) => (code: string) =>
      code === "bb" ? landingTrack(country, mode, null) : null;

    expect(
      backRollTarget(
        record,
        onlyHereSeat,
        "bb",
        SONGS_CHART,
        chartOf("only_here"),
      ),
    ).not.toBeNull();
    // Most played seats a different track, so prev keeps its clamp there: a
    // return offered from a seat the roll never took would step somewhere the
    // listener was never sent.
    expect(
      backRollTarget(
        record,
        onlyHereSeat,
        "bb",
        SONGS_CHART,
        chartOf("most_played"),
      ),
    ).toBeNull();
  });
});

describe("recordAfterSelection", () => {
  const record: RollRecord = {
    originCountryCode: ORIGIN_CODE,
    originChartRef: SONGS_CHART,
    originTrack: makeTrack(9, "https://example.com/9.m4a"),
    rolledToCode: "bb",
  };

  test("keeps the record when the selection is the roll's own landing", () => {
    expect(recordAfterSelection(record, "bb")).toBe(record);
  });

  test("clears the record when the selection moves anywhere else", () => {
    expect(recordAfterSelection(record, "cc")).toBeNull();
    expect(recordAfterSelection(record, ORIGIN_CODE)).toBeNull();
    expect(recordAfterSelection(record, null)).toBeNull();
  });

  test("passes a missing record through", () => {
    expect(recordAfterSelection(null, "bb")).toBeNull();
  });
});
