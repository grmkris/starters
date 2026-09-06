import { describe, expect, test } from "bun:test";

import {
  defaultDinoRaceJob,
  DinoRaceJobId,
  DinoRaceAssetJob,
} from "@agent-native/domain";
import { Schema } from "effect";

import {
  blenderArguments,
  canonicalJob,
  jobHash,
  jobPaths,
  processFailure,
} from "../src/dinorace/worker";

describe("trusted Blender invocation", () => {
  test("hashes decoded input canonically and invalidates changes", () => {
    const reversed = Object.fromEntries(
      Object.entries(defaultDinoRaceJob).toReversed()
    );
    expect(jobHash(Schema.decodeUnknownSync(DinoRaceAssetJob)(reversed))).toBe(
      jobHash(defaultDinoRaceJob)
    );
    expect(jobHash({ ...defaultDinoRaceJob, seed: 42 })).not.toBe(
      jobHash(defaultDinoRaceJob)
    );
    expect(JSON.parse(canonicalJob(defaultDinoRaceJob))).toEqual(
      defaultDinoRaceJob
    );
  });
  test("rejects paths before touching the filesystem", () => {
    expect(() => jobPaths("/tmp/dinorace-test", "../../etc")).toThrow();
    const id = DinoRaceJobId.generate();
    const paths = jobPaths("/tmp/dinorace-test", id);
    expect(paths.output).toBe(`/tmp/dinorace-test/jobs/${id}/output`);
    const args = blenderArguments("/trusted/build.py", paths);
    expect(args).toContain("--factory-startup");
    expect(args).toContain("--python-exit-code");
    expect(args.slice(-4)).toEqual([
      "--job",
      paths.input,
      "--output",
      paths.output,
    ]);
  });
  test("maps process failures to actionable diagnostics", () => {
    expect(processFailure(127)).toContain("BLENDER_BIN");
    expect(processFailure(9)).toContain("9");
  });
});
