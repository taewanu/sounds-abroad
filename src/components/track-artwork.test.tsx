import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";

import { TrackArtwork } from "./track-artwork";

const FIRST = "https://is1-ssl.mzstatic.com/first.jpg";
const SECOND = "https://is1-ssl.mzstatic.com/second.jpg";

test("an address that failed is tried again when it comes back", () => {
  const { container, rerender } = render(<TrackArtwork url={FIRST} />);
  fireEvent.error(container.querySelector("img") as HTMLImageElement);
  rerender(<TrackArtwork url={SECOND} />);

  rerender(<TrackArtwork url={FIRST} />);

  expect(container.querySelector("img")?.getAttribute("src")).toBe(FIRST);
});
