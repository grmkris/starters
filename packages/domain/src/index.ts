import { Schema } from "effect";

import { ClientId } from "./id";

export { ClientId, LOBBY_ROOM_ID, makeIdSchema, RoomId } from "./id";
export type { IdSchema, TypeId } from "./id";

export const PROTOCOL_VERSION = 1 as const;

export const ProtocolVersion = Schema.Literals([PROTOCOL_VERSION]);

export const Vector3 = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite,
});

export type Vector3 = typeof Vector3.Type;

export const MovementInput = Schema.Struct({
  x: Schema.Finite,
  z: Schema.Finite,
});

export type MovementInput = typeof MovementInput.Type;

export const PlayerSnapshot = Schema.Struct({
  clientId: ClientId,
  position: Vector3,
});

export type PlayerSnapshot = typeof PlayerSnapshot.Type;

/**
 * Authorises reuse of a `ClientId` across a reconnect.
 *
 * Deliberately not a TypeID. TypeIDs are UUIDv7, so they are time-ordered and
 * partially predictable - correct for an identifier, wrong for a bearer secret,
 * because possession of one is the whole claim. This is random.
 *
 * It grants identity only: the server respawns the entity, so holding a stolen
 * token gets you somebody's name and colour, never their position or progress.
 * Nothing here is a substitute for authentication; see docs/decisions/.
 */
export const ResumeToken = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[0-9a-f]{32}$/u, {
      message: "Expected a 32-character lowercase hexadecimal resume token",
    })
  ),
  Schema.brand("ResumeToken")
);

export type ResumeToken = typeof ResumeToken.Type;

const decodeResumeToken = Schema.decodeUnknownSync(ResumeToken);

/** The only place a resume token is minted. 128 bits from the CSPRNG. */
export const makeResumeToken = (): ResumeToken => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return decodeResumeToken(
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
};
