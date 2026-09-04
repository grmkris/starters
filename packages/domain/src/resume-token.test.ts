import { describe, expect, test } from "bun:test";

import { Result, Schema } from "effect";

import { makeResumeToken, ResumeToken } from "./index";

const decode = Schema.decodeUnknownResult(ResumeToken);

describe("makeResumeToken", () => {
  test("mints a 128-bit lowercase hexadecimal token", () => {
    const token = makeResumeToken();

    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[0-9a-f]{32}$/u);
  });

  test("does not repeat itself", () => {
    const tokens = new Set(
      Array.from({ length: 512 }, () => makeResumeToken())
    );

    expect(tokens.size).toBe(512);
  });

  test("is not time-ordered, unlike the TypeIDs it sits beside", () => {
    // The property that makes this a secret rather than an identifier. A
    // UUIDv7-derived token - which every other id in this repository is -
    // increases monotonically, so possession of one narrows the search for the
    // next. A sorted batch of 64 random tokens has probability 1/64!.
    const tokens = Array.from({ length: 64 }, () => makeResumeToken());

    expect(tokens).not.toEqual(tokens.toSorted());
  });
});

describe("ResumeToken", () => {
  test("accepts a token it minted", () => {
    expect(Result.isSuccess(decode(makeResumeToken()))).toBe(true);
  });

  test("rejects a token of the wrong length", () => {
    expect(Result.isFailure(decode("0".repeat(31)))).toBe(true);
    expect(Result.isFailure(decode("0".repeat(33)))).toBe(true);
  });

  test("rejects characters outside lowercase hexadecimal", () => {
    expect(Result.isFailure(decode("A".repeat(32)))).toBe(true);
    expect(Result.isFailure(decode("g".repeat(32)))).toBe(true);
  });

  test("rejects a TypeID, which is the mistake it exists to prevent", () => {
    expect(Result.isFailure(decode("cli_01j0000000000000000000000"))).toBe(
      true
    );
  });
});
