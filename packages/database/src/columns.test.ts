import { describe, expect, it } from "bun:test";

import { RoomId } from "@agent-native/domain";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Schema } from "effect";

import { rooms } from "./schema";

const idColumn = getTableConfig(rooms).columns.find(
  (column) => column.name === "id"
);

describe("typeIdPrimaryKey", () => {
  it("declares a native uuid primary key", () => {
    // The prefix lives in the type, not the database: storing the underlying
    // UUID is what keeps index size and ordering equal to a plain UUID key.
    expect(idColumn?.getSQLType()).toBe("uuid");
    expect(idColumn?.primary).toBe(true);
  });

  it("defaults to a freshly generated identifier of the column's entity", () => {
    // Decoding rather than inspecting: the default must satisfy the same schema
    // the wire uses, not merely be a string that looks close enough.
    const generated = Schema.decodeUnknownSync(RoomId)(idColumn?.defaultFn?.());

    expect(generated).toStartWith("rom_");
  });

  it("writes the underlying UUID and reads back the prefixed identifier", () => {
    const id = RoomId.generate();
    const driverValue = idColumn?.mapToDriverValue(id);

    expect(driverValue).toBe(RoomId.toUuid(id));
    expect(idColumn?.mapFromDriverValue(driverValue)).toBe(id);
  });

  it("rejects an identifier belonging to another entity", () => {
    // `toDriver` is the last checkpoint before the driver: a mislabelled
    // identifier must fail here rather than write a valid-looking row.
    expect(() =>
      idColumn?.mapToDriverValue("cli_01m1phrcs3e4f99z79n1bharhn")
    ).toThrow();
  });
});
