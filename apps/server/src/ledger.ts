import { mkdirSync } from "node:fs";

import {
  ClientId,
  DuelSnapshot,
  MovementInput,
  PlayerSnapshot,
  ProtocolVersion,
  RoomId,
} from "@agent-native/domain";
import { Schema } from "effect";

/**
 * Version of the record shape on disk.
 *
 * Deliberately not `ProtocolVersion`. The wire version says what a client and
 * server agree to speak right now and is a hard decode failure on anything
 * else; a ledger is read back long after the process that wrote it, so the two
 * move for different reasons and a shared literal would couple them.
 */
export const LEDGER_FORMAT = 3 as const;

export const RoomKind = Schema.Literals(["lobby", "duel"]);

export type RoomKind = typeof RoomKind.Type;

const CapturedInput = Schema.Struct({
  clientId: ClientId,
  input: MovementInput,
});

const CapturedDuelIntent = Schema.Struct({
  clientId: ClientId,
  fire: Schema.NullOr(Schema.Finite),
  move: Schema.NullOr(Schema.Finite),
  rematch: Schema.Boolean,
});

/**
 * One line of the ledger.
 *
 * `session.opened` and `session.closed` carry no tick. File order is the
 * record: a spawn offset is derived from how many players were present at the
 * moment of the join, so a replay reproduces it by applying the events in the
 * order they were written rather than by reconstructing a timestamp.
 *
 * That argument only holds while a file describes one room. Once the world is
 * sharded, "how many players were present" is a per-room count, and a single
 * interleaved stream would make it ambiguous - so a ledger is per room, named
 * by the room in its header, rather than gaining a roomId on every event.
 *
 * The header names the room's kind, because the replay has to build the same
 * rules the server ran: a lobby tick records players, a duel tick records the
 * whole duel.
 */
const LedgerRecord = Schema.Union([
  Schema.Struct({
    format: Schema.Literals([LEDGER_FORMAT]),
    kind: RoomKind,
    protocol: ProtocolVersion,
    roomId: RoomId,
    startedAt: Schema.Int,
    tickRate: Schema.Int,
    type: Schema.Literals(["ledger.header"]),
  }),
  Schema.Struct({
    clientId: ClientId,
    type: Schema.Literals(["session.opened"]),
  }),
  Schema.Struct({
    clientId: ClientId,
    type: Schema.Literals(["session.closed"]),
  }),
  Schema.Struct({
    inputs: Schema.Array(CapturedInput),
    players: Schema.Array(PlayerSnapshot),
    tick: Schema.Int,
    type: Schema.Literals(["tick"]),
  }),
  Schema.Struct({
    inputs: Schema.Array(CapturedDuelIntent),
    snapshot: DuelSnapshot,
    tick: Schema.Int,
    type: Schema.Literals(["duel.tick"]),
  }),
]);

export type LedgerRecord = typeof LedgerRecord.Type;

const LedgerLine = Schema.fromJsonString(LedgerRecord);

export const decodeLedgerRecord = Schema.decodeUnknownResult(LedgerLine);
export const encodeLedgerRecord = Schema.encodeSync(LedgerLine);

export interface Ledger {
  readonly record: (entry: LedgerRecord) => void;
  readonly close: () => Promise<void>;
}

export const createLedger = (
  directory: string,
  roomId: RoomId,
  startedAt: number
): Ledger => {
  mkdirSync(directory, { recursive: true });
  const sink = Bun.file(`${directory}/${roomId}-${startedAt}.ndjson`).writer();

  return {
    // `encodeLedgerRecord` throws on an unencodable record, as the wire codec
    // does. A tick record carries the same state the snapshot broadcast
    // encoded moments earlier, so recording introduces no failure the loop
    // did not already have.
    // Not awaited: the sink queues writes in order, so a tick cannot overtake
    // the one before it, and durability is the job of `close` in the server's
    // release step. Awaiting here would mean an async tick loop for no gain.
    record: (entry) => {
      void sink.write(`${encodeLedgerRecord(entry)}\n`);
    },

    close: async () => {
      await sink.end();
    },
  };
};
