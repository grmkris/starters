import { Schema } from "effect";

import { ClientId } from "./id";

export {
  ClientId,
  LOBBY_ROOM_ID,
  makeIdSchema,
  parseTypeId,
  RoomId,
} from "./id";
export type { IdSchema, TypeId, TypeIdParts } from "./id";

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

export class InvalidProtocolMessage extends Schema.TaggedError<InvalidProtocolMessage>()(
  "InvalidProtocolMessage",
  {
    message: Schema.String,
  }
) {}
