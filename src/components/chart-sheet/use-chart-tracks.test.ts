import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SONGS_CHART } from "@/lib/chart-ref";
import type { Country } from "@/lib/chart-schema";

import { useChartTracks } from "./use-chart-tracks";

function track(rank: number, name: string) {
  return {
    rank,
    name,
    artist: `Artist ${rank}`,
    previewUrl: null,
    artworkUrl: "https://art.test/a.jpg",
    appleUrl: `https://music.apple.com/br/song/${rank}?i=${rank}`,
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
      appleUrl: `https://music.apple.com/br/playlist/${id}`,
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
  const br = country("Brazil", ["pl.a"]);

  const { result } = renderHook(() => useChartTracks("br", br));

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(br.tracks);
});

test("a chart still in flight is not yet the chart on screen", async () => {
  const br = country("Brazil", ["pl.a"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("br", br));

  act(() => result.current.open("pl.a"));

  expect(result.current.pending).toBe("pl.a");
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(br.tracks);

  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "Pagode song"));
  });

  await waitFor(() => expect(result.current.ref).toBe("pl.a"));
  expect(result.current.tracks[0].name).toBe("Pagode song");
  expect(result.current.pending).toBeNull();
});

test("a slower earlier request never overwrites the chart asked for later", async () => {
  const br = country("Brazil", ["pl.a", "pl.b"]);
  const { release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("br", br));

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
  const br = country("Brazil", ["pl.a", "pl.b"]);
  const { spy, release } = deferredFetch();
  const { result } = renderHook(() => useChartTracks("br", br));

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
  const br = country("Brazil", ["pl.a"]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const { result } = renderHook(() => useChartTracks("br", br));

  await act(async () => {
    result.current.open("pl.a");
  });

  await waitFor(() => expect(result.current.failed.has("pl.a")).toBe(true));
  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(br.tracks);
  expect(result.current.pending).toBeNull();
});

test("a new country opens on its own songs chart", async () => {
  const br = country("Brazil", ["pl.a"]);
  const jp = country("Japan", ["pl.j"]);
  const { release } = deferredFetch();
  const { result, rerender } = renderHook(
    ({ code, data }) => useChartTracks(code, data),
    { initialProps: { code: "br", data: br } },
  );

  act(() => result.current.open("pl.a"));
  await act(async () => {
    release("pl.a", playlistPayload("pl.a", "Pagode song"));
  });
  await waitFor(() => expect(result.current.ref).toBe("pl.a"));

  rerender({ code: "jp", data: jp });

  expect(result.current.ref).toBe(SONGS_CHART);
  expect(result.current.tracks).toEqual(jp.tracks);
});
