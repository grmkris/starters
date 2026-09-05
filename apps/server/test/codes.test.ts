import { describe, expect, test } from "bun:test";

import { RoomCode, RoomId } from "@agent-native/domain";
import { Schema } from "effect";

import { createRoomCodes } from "../src/codes";

const TTL_MS = 60_000;

const asCode = Schema.decodeUnknownSync(RoomCode);

const clock = () => {
  let at = 0;
  return {
    advance: (ms: number): void => {
      at += ms;
    },
    now: (): number => at,
  };
};

describe("room codes", () => {
  test("mints a code that resolves back to the room", () => {
    const codes = createRoomCodes(TTL_MS);
    const roomId = RoomId.generate();

    const code = codes.mint(roomId);

    expect(code).toMatch(/^[A-Z2-9]{4}$/u);
    expect(codes.lookup(code)).toBe(roomId);
    expect(codes.codeFor(roomId)).toBe(code);
    expect(codes.isDuel(roomId)).toBe(true);
  });

  test("knows nothing of a code it never minted", () => {
    const codes = createRoomCodes(TTL_MS);

    expect(codes.lookup(codes.mint(RoomId.generate()))).toBeDefined();
    expect(codes.isDuel(RoomId.generate())).toBe(false);
  });

  test("lets a code lapse after its window", () => {
    const time = clock();
    const codes = createRoomCodes(TTL_MS, time.now);
    const code = codes.mint(RoomId.generate());

    time.advance(TTL_MS);

    expect(codes.lookup(code)).toBeUndefined();
    expect(codes.size()).toBe(0);
  });

  test("never hands out a code that is still live", () => {
    const time = clock();
    // A minter that always says the same thing until it is asked twice.
    let calls = 0;
    const codes = createRoomCodes(TTL_MS, time.now, () => {
      calls += 1;
      return asCode(calls < 3 ? "AAAA" : "BBBB");
    });

    const first = codes.mint(RoomId.generate());
    const second = codes.mint(RoomId.generate());

    expect(first).toBe(asCode("AAAA"));
    expect(second).toBe(asCode("BBBB"));
  });
});
