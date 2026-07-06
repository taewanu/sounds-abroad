import { expect, test } from "vitest";

import { trackSpreadKey } from "./track-spread";

test("trackSpreadKey keys on the Apple song id parsed from appleUrl's i= param", () => {
  const track = {
    appleUrl: "https://music.apple.com/kr/album/redred/1887671065?i=1887671067",
    artist: "Artist",
    name: "Song",
  };

  expect(trackSpreadKey(track)).toBe("id:1887671067");
});

test("trackSpreadKey is stable across countries for the same song id, regardless of locale in the URL", () => {
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

  expect(trackSpreadKey(kr)).toBe(trackSpreadKey(us));
});

test("trackSpreadKey falls back to normalized artist+name when appleUrl has no i= param", () => {
  const track = {
    appleUrl: "https://music.apple.com/kr/album/redred/1887671065",
    artist: "  The Band ",
    name: "HIT  song",
  };

  expect(trackSpreadKey(track)).toBe("name:the band|hit song");
});

test("trackSpreadKey falls back to normalized artist+name when appleUrl is unparseable", () => {
  const track = {
    appleUrl: "not a url",
    artist: "Artist",
    name: "Song",
  };

  expect(trackSpreadKey(track)).toBe("name:artist|song");
});
