import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import { defaultDinoRaceJob, DinoRaceAssetJob } from "./dinorace";

const decode = Schema.decodeUnknownSync(DinoRaceAssetJob, {
  onExcessProperty: "error",
});

describe("DinoRace asset contract", () => {
  test("accepts the reproducible demo specification", () => {
    expect(decode(defaultDinoRaceJob)).toEqual(defaultDinoRaceJob);
  });
  test("rejects unsafe dimensions, unknown fields and executable input", () => {
    for (const input of [
      { ...defaultDinoRaceJob, python: "import os" },
      { ...defaultDinoRaceJob, version: 2 },
      { ...defaultDinoRaceJob, dinosaur: { species: "trex", scale: 100 } },
      {
        ...defaultDinoRaceJob,
        dinosaur: { species: "trex", scale: Number.NaN },
      },
      { ...defaultDinoRaceJob, source: "../../secret.glb" },
    ]) {
      expect(() => decode(input)).toThrow();
    }
  });
});

test("two-horned unicorn jobs are procedural and remain bounded", () => {
  const job = {
    ...defaultDinoRaceJob,
    dinosaur: { species: "unicorn", source: "procedural", scale: 1 },
  };
  expect(decode(job).dinosaur.species).toBe("unicorn");
  expect(() =>
    decode({ ...job, dinosaur: { ...job.dinosaur, source: "studio-trex" } })
  ).toThrow();
  expect(() =>
    decode({ ...job, dinosaur: { ...job.dinosaur, scale: 7 } })
  ).toThrow();
});
