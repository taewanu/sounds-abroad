import { expect, test, vi } from "vitest";

import type { Track } from "@/lib/chart-schema";

import {
  clearNowPlaying,
  setNowPlaying,
  type MediaSessionDeps,
} from "./media-session";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    rank: 1,
    name: "Test Track",
    artist: "Test Artist",
    previewUrl: "https://example.com/preview.m4a",
    artworkUrl: "https://example.com/art/600x600bb.jpg",
    appleUrl: "https://music.apple.com/x",
    spotifySearchUrl: "https://open.spotify.com/search/x",
    ...overrides,
  };
}

class FakeMediaMetadata {
  title?: string;
  artist?: string;
  artwork?: MediaImage[];
  constructor(init: MediaMetadataInit = {}) {
    Object.assign(this, init);
  }
}

function makeDeps(overrides: Partial<MediaSessionDeps> = {}): MediaSessionDeps {
  return {
    mediaSession: { metadata: null } as MediaSession,
    metadataCtor: FakeMediaMetadata as unknown as typeof MediaMetadata,
    ...overrides,
  };
}

test("setNowPlaying sets metadata with title, artist, and artwork", () => {
  const track = makeTrack();
  const deps = makeDeps();

  setNowPlaying(track, deps);

  const meta = deps.mediaSession!.metadata as MediaMetadata;
  expect(meta.title).toBe(track.name);
  expect(meta.artist).toBe(track.artist);
  expect(meta.artwork?.[0].src).toBe(track.artworkUrl);
});

test("clearNowPlaying nulls the metadata", () => {
  const deps = makeDeps();
  setNowPlaying(makeTrack(), deps);

  clearNowPlaying(deps);

  expect(deps.mediaSession!.metadata).toBeNull();
});

test("setNowPlaying no-ops when mediaSession is unavailable", () => {
  const metadataCtor = vi.fn() as unknown as typeof MediaMetadata;

  setNowPlaying(makeTrack(), { mediaSession: null, metadataCtor });

  expect(metadataCtor).not.toHaveBeenCalled();
});

test("setNowPlaying no-ops when MediaMetadata is unavailable", () => {
  const deps = makeDeps({ metadataCtor: undefined });

  setNowPlaying(makeTrack(), deps);

  expect(deps.mediaSession!.metadata).toBeNull();
});
