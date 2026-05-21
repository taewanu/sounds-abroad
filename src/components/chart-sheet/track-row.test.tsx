import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TRACK_KR_1 } from "@/lib/__fixtures__";

import { TrackRow } from "./track-row";

describe("TrackRow", () => {
  test("renders rank, name, and artist", () => {
    render(
      <ul>
        <TrackRow track={TRACK_KR_1} />
      </ul>,
    );

    expect(screen.getByText(String(TRACK_KR_1.rank))).toBeDefined();
    expect(screen.getByText(TRACK_KR_1.name)).toBeDefined();
    expect(screen.getByText(TRACK_KR_1.artist)).toBeDefined();
  });

  test("renders artwork as a background image with the track's artworkUrl", () => {
    const { container } = render(
      <ul>
        <TrackRow track={TRACK_KR_1} />
      </ul>,
    );

    const artwork = container.querySelector('[aria-hidden="true"]');
    expect(artwork?.getAttribute("style")).toContain(TRACK_KR_1.artworkUrl);
  });
});
