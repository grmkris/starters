import { describe, expect, test } from "bun:test";

import {
  ClientId,
  LOBBY_ROOM_ID,
  PROTOCOL_VERSION,
} from "@agent-native/domain";
import { Result } from "effect";

import {
  decodeClientMessage,
  encodeClientMessage,
  encodeServerMessage,
} from "../src/index";

const clientId = ClientId.generate();

describe("wire protocol", () => {
  test("round-trips a valid client envelope", () => {
    const encoded = encodeClientMessage({
      roomId: LOBBY_ROOM_ID,
      seq: 7,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    const decoded = decodeClientMessage(encoded);

    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        roomId: LOBBY_ROOM_ID,
        seq: 7,
        type: "room.join",
        v: PROTOCOL_VERSION,
      });
    }
  });

  test("rejects unknown protocol versions", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({ roomId: LOBBY_ROOM_ID, seq: 1, type: "room.join", v: 2 })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("rejects a room identifier that is not a room TypeID", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        roomId: "lobby",
        seq: 1,
        type: "room.join",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("rejects an identifier carrying another entity's prefix", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        roomId: clientId,
        seq: 1,
        type: "room.join",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("encodes snapshots as transport-safe JSON", () => {
    const encoded = encodeServerMessage({
      players: [
        {
          clientId,
          position: { x: 1, y: 0.5, z: -2 },
        },
      ],
      roomId: LOBBY_ROOM_ID,
      seq: 9,
      tick: 12,
      type: "world.snapshot",
      v: PROTOCOL_VERSION,
    });

    expect(JSON.parse(encoded)).toEqual({
      players: [
        {
          clientId,
          position: { x: 1, y: 0.5, z: -2 },
        },
      ],
      roomId: LOBBY_ROOM_ID,
      seq: 9,
      tick: 12,
      type: "world.snapshot",
      v: PROTOCOL_VERSION,
    });
  });
});
