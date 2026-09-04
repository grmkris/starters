import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import { ClientId, LOBBY_ROOM_ID, makeIdSchema, RoomId } from "./id";

describe("makeIdSchema", () => {
  it("generates prefixed identifiers of the specification length", () => {
    const id = RoomId.generate();
    expect(id).toStartWith("rom_");
    expect(id.length).toBe("rom".length + 1 + 26);
  });

  it("generates distinct identifiers", () => {
    expect(RoomId.generate()).not.toBe(RoomId.generate());
  });

  it("decodes an identifier it generated", () => {
    const id = ClientId.generate();
    expect(Schema.decodeUnknownSync(ClientId)(id)).toBe(id);
  });

  it("rejects an identifier carrying another prefix", () => {
    const clientId = ClientId.generate();
    expect(RoomId.is(clientId)).toBe(false);
    expect(() => Schema.decodeUnknownSync(RoomId)(clientId)).toThrow();
  });

  it("rejects a suffix of the wrong length", () => {
    expect(RoomId.is("rom_0000000000e00800000000000")).toBe(false);
  });

  it("rejects a correctly shaped suffix outside the base32 alphabet", () => {
    expect(RoomId.is("rom_0000000000e00800000000000u")).toBe(false);
    expect(RoomId.is("rom_0000000000E008000000000000")).toBe(false);
  });

  it("rejects a suffix that overflows 128 bits", () => {
    expect(RoomId.is("rom_8zzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("round-trips through its UUID representation", () => {
    const id = RoomId.generate();
    expect(RoomId.fromUuid(RoomId.toUuid(id))).toBe(id);
  });

  it("refuses to register a prefix a another identifier already claimed", () => {
    expect(() => makeIdSchema("rom", "DuplicateRoomId")).toThrow(
      /already claimed by RoomId/u
    );
  });
});

describe("LOBBY_ROOM_ID", () => {
  it("is a stable, decodable room identifier", () => {
    expect(RoomId.is(LOBBY_ROOM_ID)).toBe(true);
    expect(Schema.decodeUnknownSync(RoomId)(LOBBY_ROOM_ID)).toBe(LOBBY_ROOM_ID);
    expect(RoomId.fromUuid("00000000-0000-7000-8000-000000000000")).toBe(
      LOBBY_ROOM_ID
    );
  });
});
