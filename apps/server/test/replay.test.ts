import { describe, expect, test } from "bun:test";

import { ClientId, LOBBY_ROOM_ID } from "@agent-native/domain";
import { createSimulation } from "@agent-native/game-core";

import { encodeLedgerRecord, LEDGER_FORMAT } from "../src/ledger";
import type { LedgerRecord } from "../src/ledger";
import { parseLedger, replayLedger } from "../src/replay";

const TICK_RATE = 20;
const DELTA_SECONDS = 1 / TICK_RATE;

interface Frame {
  readonly clientId: ClientId;
  readonly input: { readonly x: number; readonly z: number };
}

/**
 * Drives a real simulation and records exactly what the server writes, so a
 * replay is checked against a world some other run of `game-core` produced
 * rather than against numbers written down by hand.
 *
 * The script covers the cases that make a room hard to reproduce: a join, an
 * empty frame, a second player, a disconnect, and a rejoin - the last because a
 * spawn offset is derived from how many players were present at the time.
 */
const recordSession = () => {
  const alice = ClientId.generate();
  const bob = ClientId.generate();
  const simulation = createSimulation<ClientId>();
  const records: LedgerRecord[] = [
    {
      format: LEDGER_FORMAT,
      kind: "lobby",
      protocol: 1,
      roomId: LOBBY_ROOM_ID,
      startedAt: 0,
      tickRate: TICK_RATE,
      type: "ledger.header",
    },
  ];
  let tick = 0;

  const open = (clientId: ClientId): void => {
    simulation.spawnPlayer(clientId);
    records.push({ clientId, type: "session.opened" });
  };

  const close = (clientId: ClientId): void => {
    simulation.removePlayer(clientId);
    records.push({ clientId, type: "session.closed" });
  };

  const step = (inputs: readonly Frame[]): void => {
    for (const entry of inputs) {
      simulation.applyInput(entry.clientId, entry.input);
    }
    simulation.step(DELTA_SECONDS);
    tick += 1;
    records.push({
      inputs,
      players: simulation.snapshot(),
      tick,
      type: "tick",
    });
  };

  open(alice);
  step([{ clientId: alice, input: { x: 1, z: 0 } }]);
  step([]);
  open(bob);
  step([{ clientId: bob, input: { x: 0, z: 1 } }]);
  step([]);
  close(alice);
  step([]);
  open(alice);
  step([{ clientId: alice, input: { x: -1, z: 0 } }]);
  step([]);

  return { alice, records };
};

describe("ledger replay", () => {
  test("reproduces every recorded tick exactly", () => {
    const { records } = recordSession();

    const report = replayLedger(records);

    expect(report.divergence).toBeNull();
    expect(report.ticks).toBe(7);
  });

  test("names the tick where a divergence begins", () => {
    const { records } = recordSession();
    const corrupted = records.map((entry) => {
      if (entry.type !== "tick" || entry.tick !== 4) {
        return entry;
      }
      // One player, nudged by a millimetre at one tick. If the check cannot see
      // this it cannot see anything, and "no divergence" would mean nothing.
      const [first, ...rest] = entry.players;
      if (first === undefined) {
        return entry;
      }
      return {
        ...entry,
        players: [
          {
            ...first,
            position: { ...first.position, x: first.position.x + 0.001 },
          },
          ...rest,
        ],
      };
    });

    const report = replayLedger(corrupted);

    expect(report.divergence?.tick).toBe(4);
    expect(report.ticks).toBe(4);
  });

  test("reproduces a session that survived the ndjson encoding", () => {
    const { records } = recordSession();
    const source = records.map((entry) => encodeLedgerRecord(entry)).join("\n");

    const { failures, records: parsed } = parseLedger(source);

    expect(failures).toEqual([]);
    expect(replayLedger(parsed).divergence).toBeNull();
  });

  test("reports an undecodable line instead of skipping it silently", () => {
    const { failures, records } = parseLedger('{"type":"nonsense"}\n');

    expect(records).toEqual([]);
    expect(failures).toHaveLength(1);
  });

  test("refuses a ledger that reaches a tick with no header", () => {
    const { records } = recordSession();

    expect(() =>
      replayLedger(records.filter((entry) => entry.type !== "ledger.header"))
    ).toThrow(/header/u);
  });
});
