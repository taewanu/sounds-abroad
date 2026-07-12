import { expect, test } from "vitest";

import { sameTrack, trackKey } from "./track-identity";

test("trackKey keys on the Apple song id parsed from appleUrl's i= param", () => {
  const track = {
    appleUrl: "https://music.apple.com/kr/album/redred/1887671065?i=1887671067",
    artist: "Artist",
    name: "Song",
  };

  expect(trackKey(track)).toBe("id:1887671067");
});

test("trackKey is stable across countries for the same song id, regardless of locale in the URL", () => {
  const kr = {
    appleUrl: "https://music.apple.com/kr/album/redred/1887671065?i=1887671067",
    artist: "Artist",
    name: "Song",
  };
  const us = {
    appleUrl: "https://music.apple.com/us/album/redred/1887671065?i=1887671067",
    artist: "Artist",
    name: "Song",
  };

  expect(trackKey(kr)).toBe(trackKey(us));
});

test("trackKey falls back to normalized artist+name when appleUrl has no i= param", () => {
  const track = {
    appleUrl: "https://music.apple.com/kr/album/redred/1887671065",
    artist: "  The Band ",
    name: "HIT  song",
  };

  expect(trackKey(track)).toBe("name:the band|hit song");
});

test("trackKey falls back to normalized artist+name when appleUrl is unparseable", () => {
  const track = {
    appleUrl: "not a url",
    artist: "Artist",
    name: "Song",
  };

  expect(trackKey(track)).toBe("name:artist|song");
});

test("sameTrack matches the same song across countries even when previewUrl differs", () => {
  const kr = {
    appleUrl: "https://music.apple.com/kr/album/x/1?i=99",
    artist: "Artist",
    name: "Song",
  };
  const us = {
    appleUrl: "https://music.apple.com/us/album/x/1?i=99",
    artist: "Artist",
    name: "Song",
  };

  expect(sameTrack(kr, us)).toBe(true);
});

test("sameTrack separates two songs that share nothing but a preview asset", () => {
  const a = {
    appleUrl: "https://music.apple.com/kr/album/x/1?i=11",
    artist: "Artist",
    name: "Song A",
  };
  const b = {
    appleUrl: "https://music.apple.com/kr/album/x/2?i=22",
    artist: "Artist",
    name: "Song B",
  };

  expect(sameTrack(a, b)).toBe(false);
});

test("sameTrack is never a match when either side is null", () => {
  const track = {
    appleUrl: "https://music.apple.com/kr/album/x/1?i=11",
    artist: "Artist",
    name: "Song",
  };

  expect(sameTrack(null, track)).toBe(false);
  expect(sameTrack(track, null)).toBe(false);
  expect(sameTrack(null, null)).toBe(false);
});
