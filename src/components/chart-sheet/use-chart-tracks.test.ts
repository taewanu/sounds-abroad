import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SONGS_CHART } from "@/lib/chart-ref";
import type { Country } from "@/lib/chart-schema";

import { useChartTracks } from "./use-chart-tracks";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ track: trackEvent }));

function track(rank: number, name: string) {
  return {
    rank,
    name,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://art.test/a.jpg",
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
      artworkUrl: "https://art.test/p.jpg",
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
  const underTest = country("Country under test", ["pl.a"]);

  const { result } = renderHook(() => useChartTracks("cc", underTest));

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);
});

test("a chart still in flight is not yet the chart on screen", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));

  expect(result.current.pending).toBe("pl.a");
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);

  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
  });

  await waitFor(() => expect(result.current.ref).toBe("pl.a"));
  expect(result.current.tracks[0].name).toBe("A playlist track");
  expect(result.current.pending).toBeNull();
});

test("a slower earlier request never overwrites the chart asked for later", async () => {
  const underTest = country("Country under test", ["pl.a", "pl.b"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));
  act(() => result.current.open("pl.b"));

  await act(async () => {
    release("pl.b", playlistPayload("pl.b", "Second song"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.b"));

  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "First song"));
  });

  expect(result.current.ref).toBe("pl.b");
  expect(result.current.tracks[0].name).toBe("Second song");
});

test("an abandoned read still fills the cache, so returning to it costs nothing", async () => {
  const underTest = country("Country under test", ["pl.a", "pl.b"]);
  const { spy, release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));
  act(() => result.current.open("pl.b"));
  await act(async () => {
    release("pl.b", playlistPayload("pl.b", "Second song"));
    release("pl.a", playlistPayload("pl.a", "First song"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.b"));

  const callsBefore = spy.mock.calls.length;
  act(() => result.current.open("pl.a"));

  expect(result.current.ref).toBe("pl.a");
  expect(result.current.pending).toBeNull();
  expect(spy.mock.calls.length).toBe(callsBefore);
});

test("a chart that fails to load leaves the displayed chart alone", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.open("pl.a");
  });

  await waitFor(() => expect(result.current.failed.has("pl.a")).toBe(true));
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(underTest.tracks);
  expect(result.current.pending).toBeNull();
});

test("a new country opens on its own songs chart", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  const movedTo = country("Country moved to", ["pl.j"]);
  const { release } = deferredFetch();
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );

  act(() => result.current.open("pl.a"));
  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.a"));

  rerender({ code: "other", data: movedTo });

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(movedTo.tracks);
});

test("records every chart opened, and whether it had to be read", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));
  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.a"));

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
  const underTest = country("Country under test", ["pl.a"]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  await act(async () => {
    result.current.open("pl.a");
  });
  await waitFor(() => expect(result.current.failed.has("pl.a")).toBe(true));

  expect(trackEvent).toHaveBeenCalledWith("chart_opened", {
    country: "cc",
    chart: "playlist",
    loaded: false,
    cached: false,
  });
});

test("a chart reopened from the session cache is not counted as a fresh read", async () => {
  const underTest = country("Country under test", ["pl.a", "pl.b"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));
  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.a"));
  act(() => result.current.open(SONGS_CHART));
  act(() => result.current.open("pl.a"));

  expect(trackEvent).toHaveBeenLastCalledWith("chart_opened", {
    country: "cc",
    chart: "playlist",
    loaded: true,
    cached: true,
  });
});

test("tapping a chart already being read does not start a second read", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  const { spy, release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("cc", underTest));

  act(() => result.current.open("pl.a"));
  act(() => result.current.open("pl.a"));

  expect(spy.mock.calls.length).toBe(1);

  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.a"));
  expect(spy.mock.calls.length).toBe(1);
});

test("a read started in one country cannot land in the next", async () => {
  const underTest = country("Country under test", ["pl.a"]);
  const movedTo = country("Country moved to", ["pl.j"]);
  const { release } = deferredFetch();
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "cc", data: underTest } },
  );

  act(() => result.current.open("pl.a"));
  rerender({ code: "other", data: movedTo });

  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "A playlist track"));
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
      artworkUrl: "https://art.test/a.jpg",
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
                artworkUrl: "https://art.test/a.jpg",
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
