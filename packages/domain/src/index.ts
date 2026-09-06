import { Schema } from "effect";

import { ClientId } from "./id";

export { ClientId, LOBBY_ROOM_ID, makeIdSchema, RoomId } from "./id";
export type { IdSchema, TypeId } from "./id";
export { DinoRaceJobId } from "./id";
export {
  defaultDinoRaceJob,
  DinoRaceAssetJob,
  DinoRaceManifest,
} from "./dinorace";

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
 * Nothing here is a substitute for authentication; see
 * docs/decisions/0005-resume-tokens.md.
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

// ---------------------------------------------------------------------------
// Duel
// ---------------------------------------------------------------------------

/** Which lane a duelist holds: `-1` is x < 0, `1` is x > 0. */
export const Side = Schema.Literals([-1, 1]);

export type Side = typeof Side.Type;

export const DuelPhase = Schema.Literals([
  "waiting",
  "countdown",
  "playing",
  "roundOver",
  "matchOver",
]);

export type DuelPhase = typeof DuelPhase.Type;

/** Where along the lane the player wants to be. The server clamps it. */
export const DuelMove = Schema.Struct({
  target: Schema.Finite,
});

export type DuelMove = typeof DuelMove.Type;

/** A shot across the seam, `angle` in radians from straight across. */
export const DuelFire = Schema.Struct({
  angle: Schema.Finite,
});

export type DuelFire = typeof DuelFire.Type;

export const DuelPlayerSnapshot = Schema.Struct({
  clientId: ClientId,
  cooldown: Schema.Finite,
  health: Schema.Int,
  position: Vector3,
  rematch: Schema.Boolean,
  rounds: Schema.Int,
  side: Side,
});

export type DuelPlayerSnapshot = typeof DuelPlayerSnapshot.Type;

export const ProjectileSnapshot = Schema.Struct({
  id: Schema.Int,
  ownerId: ClientId,
  position: Vector3,
  velocity: Schema.Struct({ x: Schema.Finite, z: Schema.Finite }),
});

export type ProjectileSnapshot = typeof ProjectileSnapshot.Type;

/**
 * The whole of a duel at one tick. Kept as a field set so the wire message
 * and the ledger record spread the same definition rather than each carrying
 * a copy that can drift.
 */
export const DuelSnapshotFields = {
  countdown: Schema.Finite,
  phase: DuelPhase,
  players: Schema.Array(DuelPlayerSnapshot),
  projectiles: Schema.Array(ProjectileSnapshot),
  round: Schema.Int,
  winner: Schema.NullOr(Side),
};

export const DuelSnapshot = Schema.Struct(DuelSnapshotFields);

export type DuelSnapshot = typeof DuelSnapshot.Type;

/**
 * The field as the client renders and aims against it. `game-core` owns the
 * same numbers and may not import this package, so a server test holds the
 * two equal rather than one importing the other.
 */
export const DUEL_FIELD = {
  halfWidth: 4,
  laneHalfHeight: 4.35,
  maxFireAngle: Math.PI / 3,
  playerX: 3,
} as const;

/**
 * What one phone shows the other to join. Four characters from an alphabet
 * without I, O, 0 and 1, which are the ones people misread when typing a code
 * off somebody else's screen. Not a secret: it names a room for a minute.
 */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const RoomCode = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/u, {
      message: "Expected a 4-character room code",
    })
  ),
  Schema.brand("RoomCode")
);

export type RoomCode = typeof RoomCode.Type;

const decodeRoomCode = Schema.decodeUnknownSync(RoomCode);

/** The alphabet has 32 entries and 256 is a multiple of 32, so a byte modulo 32 is uniform. */
export const makeRoomCode = (): RoomCode => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return decodeRoomCode(
    Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % 32] ?? "A").join("")
  );
};

/** The only place a resume token is minted. 128 bits from the CSPRNG. */
export const makeResumeToken = (): ResumeToken => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return decodeResumeToken(
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
};
