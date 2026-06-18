import { expect, test } from "vitest";

import {
  buildGroundingPrompt,
  gradeGrounding,
  type GroundingClient,
  type RawGroundingJudgment,
} from "./grounding";

function judgeReturning(raw: RawGroundingJudgment): GroundingClient {
  return async () => raw;
}

test("gradeGrounding returns grounded for a grounded judgment", async () => {
  const judge = judgeReturning({
    status: "grounded",
    reason: "The source states the song debuted at number two.",
  });

  const verdict = await gradeGrounding(
    "Debuted at #2.",
    undefined,
    "src",
    judge,
  );

  expect(verdict).toEqual({
    grounded: true,
    reason: "The source states the song debuted at number two.",
  });
});

test("gradeGrounding withholds grounding for an ungrounded judgment", async () => {
  const judge = judgeReturning({
    status: "ungrounded",
    reason: "The source never mentions a chart position.",
  });

  const verdict = await gradeGrounding(
    "Debuted at #2.",
    undefined,
    "src",
    judge,
  );

  expect(verdict.grounded).toBe(false);
  expect(verdict.reason.length).toBeGreaterThan(0);
});

test("gradeGrounding fails safe on an uncertain judgment", async () => {
  const judge = judgeReturning({
    status: "uncertain",
    reason: "The source is ambiguous about the ranking.",
  });

  const verdict = await gradeGrounding(
    "Debuted at #2.",
    undefined,
    "src",
    judge,
  );

  expect(verdict.grounded).toBe(false);
});

test("gradeGrounding fails safe on an unrecognized status", async () => {
  const judge = judgeReturning({ status: "maybe", reason: "unclear" });

  const verdict = await gradeGrounding(
    "Debuted at #2.",
    undefined,
    "src",
    judge,
  );

  expect(verdict.grounded).toBe(false);
});

test("gradeGrounding yields a readable reason when the model omits one", async () => {
  const judge = judgeReturning({ status: "banana" });

  const verdict = await gradeGrounding(
    "Debuted at #2.",
    undefined,
    "src",
    judge,
  );

  expect(verdict.grounded).toBe(false);
  expect(verdict.reason.length).toBeGreaterThan(0);
});

test("gradeGrounding grounds the lead alone when detail is empty", async () => {
  let seenPrompt = "";
  const judge: GroundingClient = async (prompt) => {
    seenPrompt = prompt;
    return { status: "grounded", reason: "ok" };
  };

  await gradeGrounding("A lead claim.", "", "the source text", judge);

  expect(seenPrompt).toContain("A lead claim.");
  expect(seenPrompt).not.toContain("undefined");
});

test("buildGroundingPrompt includes the claim and source text", () => {
  const prompt = buildGroundingPrompt("The claim.", "The source body.");

  expect(prompt).toContain("The claim.");
  expect(prompt).toContain("The source body.");
});

test("buildGroundingPrompt states the explicit-statement threshold", () => {
  const prompt = buildGroundingPrompt("c", "s");

  expect(prompt).toContain("explicitly states");
});
