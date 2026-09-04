import { describe, expect, test } from "bun:test";

import { PROTOCOL_VERSION } from "@agent-native/domain";
import { Result } from "effect";

import {
  decodeClientMessage,
  encodeClientMessage,
  encodeServerMessage,
} from "../src/index";

describe("wire protocol", () => {
  test("round-trips a valid client envelope", () => {
    const encoded = encodeClientMessage({
      roomId: "lobby",
      seq: 7,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    const decoded = decodeClientMessage(encoded);

    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        roomId: "lobby",
        seq: 7,
        type: "room.join",
        v: PROTOCOL_VERSION,
      });
    }
  });

  test("rejects unknown protocol versions", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({ roomId: "lobby", seq: 1, type: "room.join", v: 2 })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("encodes snapshots as transport-safe JSON", () => {
    const encoded = encodeServerMessage({
      players: [
        {
          clientId: "player-1",
          position: { x: 1, y: 0.5, z: -2 },
        },
      ],
      roomId: "lobby",
      seq: 9,
      tick: 12,
      type: "world.snapshot",
      v: PROTOCOL_VERSION,
    });

    expect(JSON.parse(encoded)).toEqual({
      players: [
        {
          clientId: "player-1",
          position: { x: 1, y: 0.5, z: -2 },
        },
      ],
      roomId: "lobby",
      seq: 9,
      tick: 12,
      type: "world.snapshot",
      v: PROTOCOL_VERSION,
    });
  });
});
