/**
 * TypeID entity identifiers — prefixed, UUIDv7-backed, lexicographically
 * sortable strings such as `rom_01m1pg0264fvjscv3k6a2nxb0h`.
 *
 * `makeIdSchema(prefix, brand)` returns a validating Effect `Schema` whose
 * decoded type is a branded template literal. One declaration produces the
 * wire codec, the type-level brand, the generator, the guard, and the UUID
 * interop used by the database column helpers, so an identifier cannot drift
 * between transport, simulation, and storage.
 *
 * `typeid-js` owns the base32 encoding only. Keeping the Effect surface here
 * rather than depending on an Effect-coupled TypeID library means an Effect
 * release cannot break identifier decoding.
 */

import { Schema } from "effect";
import type { Brand } from "effect";
import { TypeID, fromString, toUUID, typeid } from "typeid-js";

/** Base32-encoded UUIDv7 suffix length, fixed by the TypeID specification. */
const SUFFIX_LENGTH = 26;

/**
 * Prefixes registered so far, mapped to the brand that claimed them. Two
 * entities sharing a prefix would silently accept each other's identifiers,
 * so the collision is raised when the module is imported rather than left to
 * review.
 */
const claimedPrefixes = new Map<string, string>();

/**
 * A branded TypeID string. The template literal keeps the prefix visible to
 * the type checker; the brand stops two identifier types with the same shape
 * from being interchangeable.
 */
export type TypeId<
  Prefix extends string,
  Name extends string,
> = `${Prefix}_${string}` & Brand.Brand<Name>;

/**
 * A validating branded TypeID codec plus the synchronous companions used at
 * the seams Effect does not own: Drizzle default values, narrowing guards,
 * and UUID conversion for `uuid` columns.
 */
export interface IdSchema<
  Prefix extends string,
  Name extends string,
> extends Schema.refine<TypeId<Prefix, Name>, typeof Schema.String> {
  readonly prefix: Prefix;
  readonly generate: () => TypeId<Prefix, Name>;
  readonly is: (input: string) => input is TypeId<Prefix, Name>;
  readonly fromUuid: (uuid: string) => TypeId<Prefix, Name>;
  readonly toUuid: (id: TypeId<Prefix, Name>) => string;
}

export const makeIdSchema = <
  const Prefix extends string,
  const Name extends string,
>(
  prefix: Prefix,
  brand: Name
): IdSchema<Prefix, Name> => {
  const claimedBy = claimedPrefixes.get(prefix);
  if (claimedBy !== undefined) {
    throw new Error(
      `TypeID prefix "${prefix}" is already claimed by ${claimedBy}; prefixes must be unique.`
    );
  }
  claimedPrefixes.set(prefix, brand);

  const expectedLength = prefix.length + 1 + SUFFIX_LENGTH;

  const is = (input: string): input is TypeId<Prefix, Name> => {
    if (input.length !== expectedLength || !input.startsWith(`${prefix}_`)) {
      return false;
    }
    try {
      // The length and prefix checks above are cheap but not sufficient: the
      // suffix must also be lowercase Crockford base32 that does not overflow
      // 128 bits. `fromString` throws on both, and it is the only place that
      // check exists, so a junk `rom_0…` would otherwise reach the driver.
      TypeID.fromString(input, prefix);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * The only place a plain string becomes a branded identifier. Every producer
   * routes through it, so an unchecked value cannot acquire the brand.
   */
  const assertId = (candidate: string): TypeId<Prefix, Name> => {
    if (!is(candidate)) {
      throw new Error(`"${candidate}" is not a valid ${brand}.`);
    }
    return candidate;
  };

  const schema = Schema.String.pipe(
    Schema.refine(is, {
      identifier: brand,
      message: `Expected a "${prefix}"-prefixed TypeID`,
    })
  );

  return Object.assign(schema, {
    prefix,
    generate: (): TypeId<Prefix, Name> => assertId(typeid(prefix).toString()),
    is,
    fromUuid: (uuid: string): TypeId<Prefix, Name> =>
      assertId(TypeID.fromUUID(prefix, uuid).toString()),
    // Prefix-checked on the way out as well as in. The branded parameter is a
    // compile-time guarantee only, and this is the last checkpoint before a
    // database driver: an identifier from another entity reaching here would
    // otherwise write a valid-looking row under the wrong key.
    toUuid: (id: TypeId<Prefix, Name>): string =>
      toUUID(fromString(id, prefix)),
  });
};

// ---------------------------------------------------------------------------
// Registered identifiers
// ---------------------------------------------------------------------------

export const RoomId = makeIdSchema("rom", "RoomId");
export type RoomId = typeof RoomId.Type;

export const ClientId = makeIdSchema("cli", "ClientId");
export type ClientId = typeof ClientId.Type;

export const DinoRaceJobId = makeIdSchema("dnj", "DinoRaceJobId");
export type DinoRaceJobId = typeof DinoRaceJobId.Type;

/**
 * The room every client joins before the application introduces its own room
 * lifecycle. A well-known identifier rather than a generated one so that a
 * server restart does not orphan connected clients.
 */
export const LOBBY_ROOM_ID: RoomId = RoomId.fromUuid(
  "00000000-0000-7000-8000-000000000000"
);
