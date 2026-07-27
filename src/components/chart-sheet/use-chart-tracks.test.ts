import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SONGS_CHART } from "@/lib/chart-ref";
import type { Country } from "@/lib/chart-schema";

import { useChartTracks } from "./use-chart-tracks";

const PL_A = `pl.${"a".repeat(32)}`;
const PL_B = `pl.${"b".repeat(32)}`;
const PL_J = `pl.${"c".repeat(32)}`;

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track: trackEvent }));

function track(rank: number, name: string) {
  return {
    rank,
    name,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://is1-ssl.mzstatic.com/a.jpg",
    appleUrl: `https://music.apple.com/underTest/song/${rank}?i=${rank}`,
    spotifyUrl: "https://open.spotify.com/search/a",
  };
}

function country(name: string, playlistIds: string[]): Country {
  return {
    name,
    valid: true,
    tracks: [track(1, `${name} song`)],
    playlists: playlistIds.map((id) => ({
      id,
      name: id,
      appleUrl: `https://music.apple.com/underTest/playlist/${id}`,
      artworkUrl: "https://is1-ssl.mzstatic.com/p.jpg",
      genres: [],
      trackCount: 1,
    })),
    playlistsValid: true,
  };
}

function playlistPayload(id: string, songName: string) {
  return {
    id,
    lastUpdated: "2026-07-21T00:00:00.000Z",
    tracks: [track(1, songName)],
  };
}

/** A fetch whose responses are released by the test, one playlist at a time. */
function deferredFetch() {
  const waiting = new Map<string, (payload: unknown) => void>();
  const spy = vi.fn((input: string | URL | Request) => {
    const id = decodeURIComponent(String(input).split("/").pop() ?? "");
    return new Promise<Response>((resolve) => {
      waiting.set(id, (payload) =>
        resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    });
  });
  vi.stubGlobal("fetch", spy);
  return {
    spy,
    release: (id: string, payload: unknown) => waiting.get(id)?.(payload),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("opens on the songs chart with the country's own tracks", () => {
  const underTest = country("Country under test", [PL_A]);

  const { result } = renderHook(() => useChartTracks("cc", underTest));

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);
});

test("a chart still in flight is not yet the chart on screen", async () => {
  const underTest = country("Country under test", [PL_A]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));

  expect(result.current.pending).toBe(PL_A);
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);

  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });

  await waitFor(() => expect(result.current.ref).toBe(PL_A));
  expect(result.current.tracks[0].name).toBe("A playlist track");
  expect(result.current.pending).toBeNull();
});

test("a slower earlier request never overwrites the chart asked for later", async () => {
  const underTest = country("Country under test", [PL_A, PL_B]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));
  act(() => result.current.open(PL_B));

  await act(async () => {
    release(PL_B, playlistPayload(PL_B, "Second song"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_B));

  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "First song"));
  });

  expect(result.current.ref).toBe(PL_B);
  expect(result.current.tracks[0].name).toBe("Second song");
});

test("an abandoned read still fills the cache, so returning to it costs nothing", async () => {
  const underTest = country("Country under test", [PL_A, PL_B]);
  const { spy, release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));
  act(() => result.current.open(PL_B));
  await act(async () => {
    release(PL_B, playlistPayload(PL_B, "Second song"));
    release(PL_A, playlistPayload(PL_A, "First song"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_B));

  const callsBefore = spy.mock.calls.length;
  act(() => result.current.open(PL_A));

  expect(result.current.ref).toBe(PL_A);
  expect(result.current.pending).toBeNull();
  expect(spy.mock.calls.length).toBe(callsBefore);
});

test("a chart that fails to load leaves the displayed chart alone", async () => {
  const underTest = country("Country under test", [PL_A]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.open(PL_A);
  });

  await waitFor(() => expect(result.current.failed.has(PL_A)).toBe(true));
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);
  expect(result.current.pending).toBeNull();
});

test("a new country opens on its own songs chart", async () => {
  const underTest = country("Country under test", [PL_A]);
  const movedTo = country("Country moved to", [PL_J]);
  const { release } = deferredFetch();
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );

  act(() => result.current.open(PL_A));
  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_A));

  rerender({ code: "other", data: movedTo });

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(movedTo.tracks);
});

test("records every chart opened, and whether it had to be read", async () => {
  const underTest = country("Country under test", [PL_A]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));
  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_A));

  expect(trackEvent).toHaveBeenCalledWith("chart_opened", {
    country: "cc",
    chart: "playlist",
    loaded: true,
    cached: false,
  });

  act(() => result.current.open(SONGS_CHART));

  expect(trackEvent).toHaveBeenLastCalledWith("chart_opened", {
    country: "cc",
    chart: "songs",
    loaded: true,
    cached: true,
  });
});

test("records a chart that would not load as opened but unloaded", async () => {
  const underTest = country("Country under test", [PL_A]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.open(PL_A);
  });
  await waitFor(() => expect(result.current.failed.has(PL_A)).toBe(true));

  expect(trackEvent).toHaveBeenCalledWith("chart_opened", {
    country: "cc",
    chart: "playlist",
    loaded: false,
    cached: false,
  });
});

test("a chart reopened from the session cache is not counted as a fresh read", async () => {
  const underTest = country("Country under test", [PL_A, PL_B]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));
  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_A));
  act(() => result.current.open(SONGS_CHART));
  act(() => result.current.open(PL_A));

  expect(trackEvent).toHaveBeenLastCalledWith("chart_opened", {
    country: "cc",
    chart: "playlist",
    loaded: true,
    cached: true,
  });
});

test("tapping a chart already being read does not start a second read", async () => {
  const underTest = country("Country under test", [PL_A]);
  const { spy, release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open(PL_A));
  act(() => result.current.open(PL_A));

  expect(spy.mock.calls.length).toBe(1);

  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe(PL_A));
  expect(spy.mock.calls.length).toBe(1);
});

test("a read started in one country cannot land in the next", async () => {
  const underTest = country("Country under test", [PL_A]);
  const movedTo = country("Country moved to", [PL_J]);
  const { release } = deferredFetch();
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );

  act(() => result.current.open(PL_A));
  rerender({ code: "other", data: movedTo });

  await act(async () => {
    release(PL_A, playlistPayload(PL_A, "A playlist track"));
  });

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(movedTo.tracks);
  expect(result.current.pending).toBeNull();
});

test("asks for the deeper rows only when told to, and only once", async () => {
  const underTest = country("Country under test", []);
  const rows = [
    {
      rank: 26,
      name: "A deeper song",
      artist: "An artist",
      previewUrl: null,
      artworkUrl: "https://is1-ssl.mzstatic.com/a.jpg",
      appleUrl: "https://music.apple.com/cc/song/26?i=26",
      spotifyUrl: "https://open.spotify.com/search/a",
    },
  ];
  const spy = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: "cc",
          lastUpdated: "2026-07-22T00:00:00.000Z",
          tracks: rows,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", spy);
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  expect(spy).not.toHaveBeenCalled();
  expect(result.current.tail).toBeNull();

  await act(async () => {
    result.current.readTail();
  });
  await waitFor(() => expect(result.current.tail).toEqual(rows));

  act(() => result.current.readTail());

  expect(spy).toHaveBeenCalledTimes(1);
  expect(result.current.tailPending).toBe(false);
});

test("a chart never published deeper reads as one that ends, not one that failed", async () => {
  const underTest = country("Country under test", []);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.readTail();
  });

  await waitFor(() => expect(result.current.tail).toEqual([]));
  expect(result.current.tailFailed).toBe(false);
  expect(result.current.tracks).toEqual(underTest.tracks);
});

test("deeper rows that will not load leave the chart readable", async () => {
  const underTest = country("Country under test", []);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 502 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.readTail();
  });

  await waitFor(() => expect(result.current.tailFailed).toBe(true));
  expect(result.current.tracks).toEqual(underTest.tracks);
  expect(result.current.tail).toBeNull();
});

test("another country shows none of the rows read for the last one", async () => {
  const underTest = country("Country under test", []);
  const movedTo = country("Country moved to", []);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "cc",
            lastUpdated: "2026-07-22T00:00:00.000Z",
            tracks: [
              {
                rank: 26,
                name: "A deeper song",
                artist: "An artist",
                previewUrl: null,
                artworkUrl: "https://is1-ssl.mzstatic.com/a.jpg",
                appleUrl: "https://music.apple.com/cc/song/26?i=26",
                spotifyUrl: "https://open.spotify.com/search/a",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );

  await act(async () => {
    result.current.readTail();
  });
  await waitFor(() => expect(result.current.tail).not.toBeNull());

  rerender({ code: "other", data: movedTo });

  expect(result.current.tail).toBeNull();
});

test("returning to a country shows its deeper rows again, unread", async () => {
  const underTest = country("Country under test", []);
  const movedTo = country("Country moved to", []);
  const fetchSpy = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: "cc",
          lastUpdated: "2026-07-22T00:00:00.000Z",
          tracks: [track(26, "A deeper song")],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchSpy);
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );
  await act(async () => {
    result.current.readTail();
  });
  await waitFor(() => expect(result.current.tail).not.toBeNull());

  rerender({ code: "other", data: movedTo });
  rerender({ code: "cc", data: underTest });

  expect(result.current.tail).toHaveLength(1);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("a country's deeper rows stay reachable from another country", async () => {
  const underTest = country("Country under test", []);
  const movedTo = country("Country moved to", []);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "cc",
            lastUpdated: "2026-07-22T00:00:00.000Z",
            tracks: [track(26, "A deeper song")],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );
  await act(async () => {
    result.current.readTail();
  });
  await waitFor(() => expect(result.current.tail).not.toBeNull());

  rerender({ code: "other", data: movedTo });

  // Playback follows the track, not the screen: a chart left behind has to stay
  // whole for the next step taken in it.
  expect(result.current.peekTail("cc")).toHaveLength(1);
  expect(result.current.peekTail("other")).toBeNull();
});

/** An idle callback the test drives, so the read-ahead runs when it says. */
function immediateIdle() {
  vi.stubGlobal("requestIdleCallback", (run: () => void) => {
    run();
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
}

/** Deeper rows for whichever country the request names. */
function tailsFor(status: Record<string, number> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const code = String(input).split("/").pop() ?? "";
    const code_ = status[code];
    if (code_ !== undefined) return new Response("", { status: code_ });
    return new Response(
      JSON.stringify({
        code,
        lastUpdated: "2026-07-25T00:00:00.000Z",
        tracks: [track(26, `${code} deep`)],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

test("reads every charted country's deeper rows once the page is idle", async () => {
  const underTest = country("Country under test", []);
  immediateIdle();
  const spy = tailsFor();
  vi.stubGlobal("fetch", spy);

  const { result } = renderHook(() =>
    useChartTracks("cc", underTest, SONGS_CHART, ["cc", "bb", "dd"]),
  );

  await waitFor(() => expect(result.current.peekTail("dd")).not.toBeNull());
  expect(result.current.peekTail("cc")).toHaveLength(1);
  expect(result.current.peekTail("bb")).toHaveLength(1);
  expect(spy).toHaveBeenCalledTimes(3);
});

test("a country that will not load leaves the others whole", async () => {
  const underTest = country("Country under test", []);
  immediateIdle();
  vi.stubGlobal("fetch", tailsFor({ bb: 502 }));

  const { result } = renderHook(() =>
    useChartTracks("cc", underTest, SONGS_CHART, ["cc", "bb", "dd"]),
  );

  await waitFor(() => expect(result.current.peekTail("dd")).not.toBeNull());
  expect(result.current.peekTail("cc")).not.toBeNull();
  expect(result.current.peekTail("bb")).toBeNull();
});

test("reads a country the listener already asked for exactly once", async () => {
  const underTest = country("Country under test", []);
  const spy = tailsFor();
  vi.stubGlobal("fetch", spy);
  // Idle only after the listener's own read is in flight, the order a country
  // reached before the page settles arrives in.
  const { result, rerender } = renderHook(
    ({ codes }) => useChartTracks("cc", underTest, SONGS_CHART, codes),
    { initialProps: { codes: [] as string[] } },
  );
  await act(async () => {
    result.current.readTail();
  });
  await waitFor(() => expect(result.current.tail).not.toBeNull());

  immediateIdle();
  rerender({ codes: ["cc", "bb"] });

  await waitFor(() => expect(result.current.peekTail("bb")).not.toBeNull());
  expect(spy).toHaveBeenCalledTimes(2);
});

test("takes a run of landed reads to the screen together", async () => {
  const underTest = country("Country under test", []);
  immediateIdle();
  vi.stubGlobal("fetch", tailsFor());
  let renders = 0;

  const { result } = renderHook(() => {
    renders += 1;
    return useChartTracks("cc", underTest, SONGS_CHART, [
      "cc",
      "bb",
      "dd",
      "ee",
      "ff",
      "gg",
    ]);
  });

  await waitFor(() => expect(result.current.peekTail("gg")).not.toBeNull());

  // One commit for the run, not one per country: sixty-odd separate ones are
  // the cost the read-ahead exists to remove.
  expect(renders).toBeLessThan(6);
});

/** An idle callback the test holds, so a teardown can cancel one mid-flight. */
function heldIdle() {
  const queued: Array<{ run: () => void; cancelled: boolean }> = [];
  vi.stubGlobal("requestIdleCallback", (run: () => void) => {
    queued.push({ run, cancelled: false });
    return queued.length;
  });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => {
    const slot = queued[handle - 1];
    if (slot) slot.cancelled = true;
  });
  return {
    runPending: () =>
      queued.filter((slot) => !slot.cancelled).forEach((slot) => slot.run()),
  };
}

test("schedules the read-ahead again when the effect runs a second time", async () => {
  const underTest = country("Country under test", []);
  const idle = heldIdle();
  const spy = tailsFor();
  vi.stubGlobal("fetch", spy);
  const { result, rerender } = renderHook(
    ({ codes }) => useChartTracks("cc", underTest, SONGS_CHART, codes),
    { initialProps: { codes: ["cc", "bb"] } },
  );

  // Strict mode mounts, tears down, and mounts again, which cancels the first
  // pass's idle work before it can run. The second pass has to schedule its own
  // or the rows are never read at all.
  rerender({ codes: ["cc", "bb"] });
  idle.runPending();

  await waitFor(() => expect(result.current.peekTail("bb")).not.toBeNull());
  expect(spy).toHaveBeenCalledTimes(2);
});
