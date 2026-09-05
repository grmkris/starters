import { describe, expect, test } from "bun:test";

import {
  ClientId,
  LOBBY_ROOM_ID,
  makeResumeToken,
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

  test("round-trips a join that carries a resume claim", () => {
    const resume = { clientId, resumeToken: makeResumeToken() };
    const decoded = decodeClientMessage(
      encodeClientMessage({
        resume,
        roomId: LOBBY_ROOM_ID,
        seq: 1,
        type: "room.join",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded) && decoded.success.type === "room.join") {
      expect(decoded.success.resume).toEqual(resume);
    }
  });

  test("tells a joined client which identity the world uses for it", () => {
    const encoded = encodeServerMessage({
      capacity: 16,
      clientId,
      connected: 1,
      roomId: LOBBY_ROOM_ID,
      seq: 2,
      type: "room.joined",
      v: PROTOCOL_VERSION,
    });

    expect(JSON.parse(encoded)).toMatchObject({
      clientId,
      type: "room.joined",
    });
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

  test("round-trips a shot across the seam", () => {
    const decoded = decodeClientMessage(
      encodeClientMessage({
        fire: { angle: 0.5 },
        seq: 3,
        type: "duel.fire",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded) && decoded.success.type === "duel.fire") {
      expect(decoded.success.fire.angle).toBe(0.5);
    }
  });

  test("rejects a shot with no finite angle", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        fire: { angle: "up" },
        seq: 3,
        type: "duel.fire",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("rejects a room code with a character people misread", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        code: "AB0I",
        seq: 1,
        type: "duel.join",
        v: PROTOCOL_VERSION,
      })
    );

    expect(Result.isFailure(decoded)).toBe(true);
  });

  test("encodes a duel snapshot with a null winner", () => {
    const encoded = encodeServerMessage({
      countdown: 2.5,
      phase: "countdown",
      players: [],
      projectiles: [],
      roomId: LOBBY_ROOM_ID,
      round: 1,
      seq: 4,
      tick: 40,
      type: "duel.snapshot",
      v: PROTOCOL_VERSION,
      winner: null,
    });

    expect(JSON.parse(encoded)).toMatchObject({
      phase: "countdown",
      winner: null,
    });
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
