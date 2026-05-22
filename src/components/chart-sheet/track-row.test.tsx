import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Track } from "@/lib/chart-schema";

import { TrackRow } from "./track-row";

const track: Track = {
  rank: 1,
  name: "Test Track",
  artist: "Test Artist",
  previewUrl: "https://example.com/preview.m4a",
  artworkUrl: "https://example.com/artwork.jpg",
  appleUrl: "https://music.apple.com/track/1",
  spotifySearchUrl: "https://open.spotify.com/search/Test%20Track",
};

describe("TrackRow", () => {
  test("renders rank, name, and artist", () => {
    render(
      <ul>
        <TrackRow track={track} />
      </ul>,
    );

    expect(screen.getByText(String(track.rank))).toBeDefined();
    expect(screen.getByText(track.name)).toBeDefined();
    expect(screen.getByText(track.artist)).toBeDefined();
  });

  test("renders artwork as a background image with the track's artworkUrl", () => {
    const { container } = render(
      <ul>
        <TrackRow track={track} />
      </ul>,
    );

    const artwork = container.querySelector('[aria-hidden="true"]');
    expect(artwork?.getAttribute("style")).toContain(track.artworkUrl);
  });
});
