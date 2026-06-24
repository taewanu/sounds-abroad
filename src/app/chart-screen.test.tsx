import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CHARTS, CODE_BR, CODE_US, COUNTRY_US } from "@/lib/__fixtures__";
import { uiModeStore } from "@/lib/ui-mode-store";

const mockSearchParams = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.value,
}));

import { ChartScreen } from "./chart-screen";

describe("ChartScreen", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams();
    replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    replaceState.mockRestore();
  });

  test("renders the chart for a valid ?cc= without touching the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("falls back to defaultCountryCode and writes it to the URL when ?cc= is absent", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("falls back to defaultCountryCode for an invalid ?cc=", () => {
    mockSearchParams.value = new URLSearchParams("cc=xx");

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_US} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });

  test("canonicalizes an uppercase ?cc= in the URL", () => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US.toUpperCase()}`);

    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(screen.getByText(COUNTRY_US.tracks[0].name)).toBeDefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", `?cc=${CODE_US}`);
  });
});

describe("ChartScreen globe coupling", () => {
  beforeEach(() => {
    mockSearchParams.value = new URLSearchParams(`cc=${CODE_US}`);
    uiModeStore.setState({ readMode: false, settleSignal: 0 });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("publishes read mode to the globe at full and clears it back at peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    expect(uiModeStore.getState().readMode).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(uiModeStore.getState().readMode).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse chart" }));
    expect(uiModeStore.getState().readMode).toBe(false);
  });

  test("a settle raises a dismissed sheet back to peek", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet.dataset.snap).toBe("closed");

    act(() => {
      uiModeStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("a settle leaves an open sheet where it is", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);
    const sheet = screen.getByTestId("chart-sheet");

    expect(sheet.dataset.snap).toBe("peek");
    act(() => {
      uiModeStore.getState().signalSettle();
    });
    expect(sheet.dataset.snap).toBe("peek");
  });

  test("releases read mode when the chart unmounts", () => {
    const { unmount } = render(
      <ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand chart" }));
    expect(uiModeStore.getState().readMode).toBe(true);

    unmount();
    expect(uiModeStore.getState().readMode).toBe(false);
  });

  test("a settle never starts audio on its own", () => {
    render(<ChartScreen charts={CHARTS} defaultCountryCode={CODE_BR} />);

    act(() => {
      uiModeStore.getState().signalSettle();
    });

    // The mini player only mounts once a track plays; its absence after a settle
    // shows the landing selected a country without starting audio.
    expect(screen.queryByRole("button", { name: "Reopen chart" })).toBeNull();
  });
});
