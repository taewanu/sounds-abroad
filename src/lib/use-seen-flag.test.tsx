import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";

import { createSeenFlag, type SeenFlag } from "./create-seen-flag";
import { useSeenFlag } from "./use-seen-flag";

const KEY = "sounds-abroad:test-flag:v1";

function Harness({ flag }: { flag: SeenFlag }) {
  const { seen, markSeen } = useSeenFlag(flag);
  const label = seen === null ? "unknown" : seen ? "yes" : "no";
  return (
    <button data-testid="probe" data-seen={label} onClick={markSeen}>
      mark
    </button>
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("useSeenFlag", () => {
  test("settles to unseen after mount when nothing is stored", () => {
    const { getByTestId } = render(<Harness flag={createSeenFlag(KEY)} />);

    expect(getByTestId("probe").getAttribute("data-seen")).toBe("no");
  });

  test("settles to seen after mount when the flag is set", () => {
    localStorage.setItem(KEY, "1");

    const { getByTestId } = render(<Harness flag={createSeenFlag(KEY)} />);

    expect(getByTestId("probe").getAttribute("data-seen")).toBe("yes");
  });

  test("treats a malformed stored value as unseen", () => {
    localStorage.setItem(KEY, "yes");

    const { getByTestId } = render(<Harness flag={createSeenFlag(KEY)} />);

    expect(getByTestId("probe").getAttribute("data-seen")).toBe("no");
  });

  test("markSeen persists the flag so the next visit reads it as seen", () => {
    const first = render(<Harness flag={createSeenFlag(KEY)} />);

    fireEvent.click(first.getByTestId("probe"));
    first.unmount();
    const second = render(<Harness flag={createSeenFlag(KEY)} />);

    expect(localStorage.getItem(KEY)).toBe("1");
    expect(second.getByTestId("probe").getAttribute("data-seen")).toBe("yes");
  });

  test("stays undecided when rendered without effects (SSR, no flash)", () => {
    const html = renderToString(<Harness flag={createSeenFlag(KEY)} />);

    expect(html).toContain('data-seen="unknown"');
  });
});
