import {
  ClientId,
  MovementInput,
  PlayerSnapshot,
  ProtocolVersion,
  ResumeToken,
  RoomId,
} from "@agent-native/domain";
import { Schema } from "effect";

const Envelope = {
  seq: Schema.Int,
  v: ProtocolVersion,
};

/**
 * Presented on `room.join` to reclaim a `ClientId` after a reconnect. The pair
 * must match what the server issued; either half alone proves nothing.
 */
const Resume = Schema.Struct({
  clientId: ClientId,
  resumeToken: ResumeToken,
});

const ClientMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    resume: Schema.optional(Resume),
    roomId: RoomId,
    type: Schema.Literals(["room.join"]),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(["room.leave"]),
  }),
  Schema.Struct({
    ...Envelope,
    // No roomId: the server knows which room the socket is in, and a
    // client-supplied one is both a spoofing surface and a source of disagreement.
    input: MovementInput,
    type: Schema.Literals(["player.input"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["ping"]),
  }),
]);

/** Why a join was refused. `server_full` is the only one where retrying the same room is pointless. */
const RejectionReason = Schema.Literals([
  "already_in_room",
  "room_full",
  "server_full",
]);

const DepartureReason = Schema.Literals(["client_request"]);

/** Only the codes the server actually emits. */
const ProtocolErrorCode = Schema.Literals(["invalid_message", "not_in_room"]);

const ServerMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    // Identity only. Membership begins at `room.join`, so this deliberately
    // names no room: the connection is somewhere only once it has asked to be.
    clientId: ClientId,
    resumeToken: ResumeToken,
    tickRate: Schema.Int,
    type: Schema.Literals(["session.welcome"]),
  }),
  Schema.Struct({
    ...Envelope,
    capacity: Schema.Int,
    // The identity the world knows this connection by. It differs from the
    // one `session.welcome` announced when a resume claim was honoured, and
    // a client that kept the welcome id would render its own entity as remote.
    clientId: ClientId,
    connected: Schema.Int,
    roomId: RoomId,
    type: Schema.Literals(["room.joined"]),
  }),
  Schema.Struct({
    ...Envelope,
    reason: DepartureReason,
    roomId: RoomId,
    type: Schema.Literals(["room.left"]),
  }),
  Schema.Struct({
    ...Envelope,
    reason: RejectionReason,
    roomId: RoomId,
    type: Schema.Literals(["room.rejected"]),
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
    code: ProtocolErrorCode,
    message: Schema.String,
    type: Schema.Literals(["protocol.error"]),
  }),
]);

/**
 * Close code sent to a connection whose identity a newer connection resumed.
 * It sits in the range the WebSocket RFC leaves to applications. A client that
 * receives it must not present the same claim again: two tabs that share one
 * stored identity would otherwise close each other forever.
 */
export const SUPERSEDED_CLOSE_CODE = 4000;

export type ClientMessage = typeof ClientMessage.Type;
export type ServerMessage = typeof ServerMessage.Type;

/**
 * A server message without its sequence number.
 *
 * `seq` counts messages sent on one connection, so only the sender can know it.
 * Taking a body without one means a caller cannot supply a wrong value, and the
 * counter has exactly one writer.
 */
export type ServerMessageBody = ServerMessage extends infer Message
  ? Message extends ServerMessage
    ? Omit<Message, "seq">
    : never
  : never;

const ClientWireMessage = Schema.fromJsonString(ClientMessage);
const ServerWireMessage = Schema.fromJsonString(ServerMessage);

export const decodeClientMessage =
  Schema.decodeUnknownResult(ClientWireMessage);
export const decodeServerMessage =
  Schema.decodeUnknownResult(ServerWireMessage);
export const encodeClientMessage = Schema.encodeSync(ClientWireMessage);
export const encodeServerMessage = Schema.encodeSync(ServerWireMessage);
