import { describe, expect, test } from "vitest";

import { SONGS_CHART } from "./chart-ref";
import type { ChartFile, Country, Playlist, Track } from "./chart-schema";
import {
  backRollTarget,
  firstPlayable,
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
): Track {
  return {
    rank,
    name: `Track ${rank}`,
    artist: `Artist ${rank}`,
    previewUrl,
    artworkUrl: "https://example.com/art.jpg",
    appleUrl,
    spotifyUrl: "https://open.spotify.com/search/x",
  };
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

describe("planRoll", () => {
  const playableHead = makeTrack(1, "https://example.com/1.m4a");

  test("lands on the first draw when its chart can play, starting at its first playable", () => {
    const gap = makeTrack(1, null);
    const target = makeTrack(2, "https://example.com/2.m4a");
    const countries: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([playableHead]),
      bb: makeCountry([gap, target]),
    };
    const { draw, excludeSeen } = queuedDraw(["bb"]);

    const landing = planRoll(countries, ORIGIN_CODE, draw);

    expect(landing).toEqual({ code: "bb", track: target });
    expect(excludeSeen).toEqual([[ORIGIN_CODE]]);
  });

  test("redraws past a drawn code with no chart, excluding the failed candidate", () => {
    const countries: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([playableHead]),
      cc: makeCountry([playableHead]),
    };
    const { draw, excludeSeen } = queuedDraw(["bb", "cc"]);

    const landing = planRoll(countries, ORIGIN_CODE, draw);

    expect(landing?.code).toBe("cc");
    expect(excludeSeen).toEqual([[ORIGIN_CODE], [ORIGIN_CODE, "bb"]]);
  });

  test("redraws past a drawn chart with no playable track", () => {
    const countries: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([playableHead]),
      bb: makeCountry([makeTrack(1, null), makeTrack(2, null)]),
      cc: makeCountry([playableHead]),
    };
    const { draw } = queuedDraw(["bb", "cc"]);

    expect(planRoll(countries, ORIGIN_CODE, draw)?.code).toBe("cc");
  });

  test("every redraw excludes the origin and all earlier failed candidates", () => {
    const countries: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([playableHead]),
    };
    const { draw, excludeSeen } = queuedDraw(["bb", "cc", "dd"]);

    planRoll(countries, ORIGIN_CODE, draw);

    expect(excludeSeen).toEqual([
      [ORIGIN_CODE],
      [ORIGIN_CODE, "bb"],
      [ORIGIN_CODE, "bb", "cc"],
    ]);
  });

  test("stops after the attempt bound and falls back to a dead stop", () => {
    const countries: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([playableHead]),
    };
    const { draw, excludeSeen } = queuedDraw(["bb", "cc", "dd", "ee"]);

    const landing = planRoll(countries, ORIGIN_CODE, draw);

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
  const rolledGap = makeTrack(1, null);
  const rolledFirst = makeTrack(2, "https://example.com/r2.m4a");
  const rolledSecond = makeTrack(3, "https://example.com/r3.m4a");
  const countries: ChartFile["countries"] = {
    [ORIGIN_CODE]: makeCountry([originLast]),
    bb: makeCountry([rolledGap, rolledFirst, rolledSecond]),
  };
  const record: RollRecord = {
    originCountryCode: ORIGIN_CODE,
    originChartRef: SONGS_CHART,
    originTrack: originLast,
    rolledToCode: "bb",
  };

  test("returns the origin at the rolled-in chart's first playable", () => {
    expect(
      backRollTarget(record, countries, rolledFirst, "bb", SONGS_CHART),
    ).toEqual({
      countryCode: ORIGIN_CODE,
      chartRef: SONGS_CHART,
      track: originLast,
    });
  });

  test("keeps the clamp past the rolled-in chart's first playable", () => {
    expect(
      backRollTarget(record, countries, rolledSecond, "bb", SONGS_CHART),
    ).toBeNull();
  });

  test("keeps the clamp when playback is not on the rolled-in chart", () => {
    expect(
      backRollTarget(record, countries, rolledFirst, "cc", SONGS_CHART),
    ).toBeNull();
    expect(
      backRollTarget(record, countries, originLast, ORIGIN_CODE, SONGS_CHART),
    ).toBeNull();
  });

  test("keeps the clamp with no record or nothing playing", () => {
    expect(
      backRollTarget(null, countries, rolledFirst, "bb", SONGS_CHART),
    ).toBeNull();
    expect(
      backRollTarget(record, countries, null, "bb", SONGS_CHART),
    ).toBeNull();
  });

  test("keeps the clamp once playback has moved to another of the country's charts", () => {
    expect(
      backRollTarget(record, countries, rolledFirst, "bb", "pl.other"),
    ).toBeNull();
  });

  test("keeps the clamp when the rolled-in chart is gone from the chart file", () => {
    const withoutRolled: ChartFile["countries"] = {
      [ORIGIN_CODE]: makeCountry([originLast]),
    };

    expect(
      backRollTarget(record, withoutRolled, rolledFirst, "bb", SONGS_CHART),
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
