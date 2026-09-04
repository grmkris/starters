import { mkdirSync } from "node:fs";

import {
  ClientId,
  MovementInput,
  PlayerSnapshot,
  ProtocolVersion,
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
export const LEDGER_FORMAT = 1 as const;

const CapturedInput = Schema.Struct({
  clientId: ClientId,
  input: MovementInput,
});

/**
 * One line of the ledger.
 *
 * `session.opened` and `session.closed` carry no tick. File order is the
 * record: a spawn offset is derived from how many players were present at the
 * moment of the join, so a replay reproduces it by applying the events in the
 * order they were written rather than by reconstructing a timestamp.
 */
const LedgerRecord = Schema.Union([
  Schema.Struct({
    format: Schema.Literals([LEDGER_FORMAT]),
    protocol: ProtocolVersion,
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
]);

export type LedgerRecord = typeof LedgerRecord.Type;

const LedgerLine = Schema.fromJsonString(LedgerRecord);

export const decodeLedgerRecord = Schema.decodeUnknownResult(LedgerLine);
export const encodeLedgerRecord = Schema.encodeSync(LedgerLine);

export interface Ledger {
  readonly record: (entry: LedgerRecord) => void;
  readonly close: () => Promise<void>;
}

export const createLedger = (directory: string, startedAt: number): Ledger => {
  mkdirSync(directory, { recursive: true });
  const sink = Bun.file(`${directory}/room-${startedAt}.ndjson`).writer();

  return {
    // `encodeLedgerRecord` throws on an unencodable record, as the wire codec
    // does. A tick record carries the same player positions the snapshot
    // broadcast encoded moments earlier, so recording introduces no failure the
    // loop did not already have.
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
