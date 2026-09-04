import type { ClientId, PlayerSnapshot } from "@agent-native/domain";
import { createSimulation } from "@agent-native/game-core";
import { Result } from "effect";

import { decodeLedgerRecord } from "./ledger";
import type { LedgerRecord } from "./ledger";

export interface ReplayDivergence {
  readonly tick: number;
  readonly expected: readonly PlayerSnapshot[];
  readonly actual: readonly PlayerSnapshot[];
}

export interface ReplayReport {
  readonly ticks: number;
  /** Null when every recorded tick was reproduced exactly. */
  readonly divergence: ReplayDivergence | null;
}

const samePosition = (
  expected: PlayerSnapshot,
  actual: PlayerSnapshot
): boolean =>
  expected.clientId === actual.clientId &&
  // Exact rather than approximate: both sides ran the same float64 arithmetic
  // in the same order, so anything but bit equality is a real divergence.
  expected.position.x === actual.position.x &&
  expected.position.y === actual.position.y &&
  expected.position.z === actual.position.z;

const sameWorld = (
  expected: readonly PlayerSnapshot[],
  actual: readonly PlayerSnapshot[]
): boolean => {
  if (expected.length !== actual.length) {
    return false;
  }

  return expected.every((player, index) => {
    const counterpart = actual[index];
    return counterpart !== undefined && samePosition(player, counterpart);
  });
};

/**
 * Rebuilds a room from its ledger and checks itself against what was recorded.
 *
 * The simulation is imported unchanged from `game-core`. That is the point of
 * the exercise: if a replay needed its own copy of the rules, agreement between
 * the two would prove nothing about the server.
 */
export const replayLedger = (records: Iterable<LedgerRecord>): ReplayReport => {
  const simulation = createSimulation<ClientId>();
  let deltaSeconds: number | null = null;
  let ticks = 0;

  for (const record of records) {
    switch (record.type) {
      case "ledger.header": {
        deltaSeconds = 1 / record.tickRate;
        break;
      }
      case "session.opened": {
        simulation.spawnPlayer(record.clientId);
        break;
      }
      case "session.closed": {
        simulation.removePlayer(record.clientId);
        break;
      }
      case "tick": {
        if (deltaSeconds === null) {
          throw new Error(
            "Ledger reached a tick before its header; the timestep is unknown."
          );
        }

        for (const entry of record.inputs) {
          simulation.applyInput(entry.clientId, entry.input);
        }
        simulation.step(deltaSeconds);
        ticks += 1;

        const actual = simulation.snapshot();
        if (!sameWorld(record.players, actual)) {
          return {
            divergence: { actual, expected: record.players, tick: record.tick },
            ticks,
          };
        }
        break;
      }
    }
  }

  return { divergence: null, ticks };
};

export const parseLedger = (source: string) => {
  const records: LedgerRecord[] = [];
  const failures: string[] = [];

  for (const [index, line] of source.split("\n").entries()) {
    if (line.trim() === "") {
      continue;
    }

    const decoded = decodeLedgerRecord(line);
    if (Result.isFailure(decoded)) {
      failures.push(`line ${index + 1}: ${decoded.failure.message}`);
      continue;
    }
    records.push(decoded.success);
  }

  return { failures, records };
};

if (import.meta.main) {
  const path = Bun.argv.at(2);

  if (path === undefined) {
    console.error("Usage: bun src/replay.ts <ledger.ndjson>");
    process.exitCode = 1;
  } else {
    const { failures, records } = parseLedger(await Bun.file(path).text());

    for (const failure of failures) {
      console.error(`Undecodable ledger record, ${failure}`);
    }

    const report = replayLedger(records);

    if (report.divergence === null && failures.length === 0) {
      console.info(`Replay matched the ledger (${report.ticks} ticks)`);
    } else {
      const { divergence } = report;
      if (divergence !== null) {
        console.error(
          `Replay diverged at tick ${divergence.tick} after ${report.ticks} ticks.`
        );
        console.error(`  recorded: ${JSON.stringify(divergence.expected)}`);
        console.error(`  replayed: ${JSON.stringify(divergence.actual)}`);
      }
      process.exitCode = 1;
    }
  }
}
