import { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { ChartScreenLoader } from "./chart-screen-loader";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("./chart-screen", () => ({ ChartScreen: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a failed chart read offers a retry that reloads the page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const reload = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    reload,
  });

  await act(async () => {
    render(
      <Suspense>
        <ChartScreenLoader />
      </Suspense>,
    );
  });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(screen.getByRole("alert").textContent).toContain("Charts didn’t load");
  expect(reload).toHaveBeenCalledOnce();
});
