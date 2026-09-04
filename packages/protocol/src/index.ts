import {
  ClientId,
  MovementInput,
  PlayerSnapshot,
  ProtocolVersion,
  RoomId,
} from "@agent-native/domain";
import { Schema } from "effect";

const Envelope = {
  seq: Schema.Int,
  v: ProtocolVersion,
};

const ClientMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    roomId: RoomId,
    type: Schema.Literals(["room.join"]),
  }),
  Schema.Struct({
    ...Envelope,
    input: MovementInput,
    roomId: RoomId,
    type: Schema.Literals(["player.input"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["ping"]),
  }),
]);

const ServerMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    clientId: ClientId,
    roomId: RoomId,
    tickRate: Schema.Int,
    type: Schema.Literals(["session.welcome"]),
  }),
  Schema.Struct({
    ...Envelope,
    connected: Schema.Int,
    roomId: RoomId,
    type: Schema.Literals(["room.presence"]),
  }),
  Schema.Struct({
    ...Envelope,
    players: Schema.Array(PlayerSnapshot),
    roomId: RoomId,
    tick: Schema.Int,
    type: Schema.Literals(["world.snapshot"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["pong"]),
  }),
  Schema.Struct({
    ...Envelope,
    code: Schema.String,
    message: Schema.String,
    type: Schema.Literals(["protocol.error"]),
  }),
]);

export type ClientMessage = typeof ClientMessage.Type;
export type ServerMessage = typeof ServerMessage.Type;

const ClientWireMessage = Schema.fromJsonString(ClientMessage);
const ServerWireMessage = Schema.fromJsonString(ServerMessage);

export const decodeClientMessage =
  Schema.decodeUnknownResult(ClientWireMessage);
export const decodeServerMessage =
  Schema.decodeUnknownResult(ServerWireMessage);
export const encodeClientMessage = Schema.encodeSync(ClientWireMessage);
export const encodeServerMessage = Schema.encodeSync(ServerWireMessage);
