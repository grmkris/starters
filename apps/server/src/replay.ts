import type {
  ClientId,
  DuelSnapshot,
  PlayerSnapshot,
} from "@agent-native/domain";
import {
  createDuelSimulation,
  createSimulation,
} from "@agent-native/game-core";
import type { DuelSimulation, Simulation } from "@agent-native/game-core";
import { Result } from "effect";

import { decodeLedgerRecord } from "./ledger";
import type { LedgerRecord } from "./ledger";

export interface ReplayDivergence {
  readonly tick: number;
  readonly expected: readonly PlayerSnapshot[] | DuelSnapshot;
  readonly actual: readonly PlayerSnapshot[] | DuelSnapshot;
}

export interface ReplayReport {
  readonly ticks: number;
  /** Null when every recorded tick was reproduced exactly. */
  readonly divergence: ReplayDivergence | null;
}

const sameVector = (
  expected: { readonly x: number; readonly y: number; readonly z: number },
  actual: { readonly x: number; readonly y: number; readonly z: number }
): boolean =>
  // Exact rather than approximate: both sides ran the same float64 arithmetic
  // in the same order, so anything but bit equality is a real divergence.
  expected.x === actual.x && expected.y === actual.y && expected.z === actual.z;

const sameWorld = (
  expected: readonly PlayerSnapshot[],
  actual: readonly PlayerSnapshot[]
): boolean =>
  expected.length === actual.length &&
  expected.every((player, index) => {
    const counterpart = actual[index];
    return (
      counterpart !== undefined &&
      player.clientId === counterpart.clientId &&
      sameVector(player.position, counterpart.position)
    );
  });

const sameDuel = (expected: DuelSnapshot, actual: DuelSnapshot): boolean =>
  expected.phase === actual.phase &&
  expected.round === actual.round &&
  expected.countdown === actual.countdown &&
  expected.winner === actual.winner &&
  expected.players.length === actual.players.length &&
  expected.players.every((player, index) => {
    const counterpart = actual.players[index];
    return (
      counterpart !== undefined &&
      player.clientId === counterpart.clientId &&
      player.side === counterpart.side &&
      player.health === counterpart.health &&
      player.rounds === counterpart.rounds &&
      player.cooldown === counterpart.cooldown &&
      player.rematch === counterpart.rematch &&
      sameVector(player.position, counterpart.position)
    );
  }) &&
  expected.projectiles.length === actual.projectiles.length &&
  expected.projectiles.every((projectile, index) => {
    const counterpart = actual.projectiles[index];
    return (
      counterpart !== undefined &&
      projectile.id === counterpart.id &&
      projectile.ownerId === counterpart.ownerId &&
      projectile.velocity.x === counterpart.velocity.x &&
      projectile.velocity.z === counterpart.velocity.z &&
      sameVector(projectile.position, counterpart.position)
    );
  });

type Rules =
  | { readonly kind: "lobby"; readonly simulation: Simulation<ClientId> }
  | { readonly kind: "duel"; readonly simulation: DuelSimulation<ClientId> };

/**
 * Rebuilds a room from its ledger and checks itself against what was recorded.
 *
 * The simulations are imported unchanged from `game-core`. That is the point
 * of the exercise: if a replay needed its own copy of the rules, agreement
 * between the two would prove nothing about the server.
 */
export const replayLedger = (records: Iterable<LedgerRecord>): ReplayReport => {
  let rules: Rules | null = null;
  let deltaSeconds: number | null = null;
  let ticks = 0;

  const ready = () => {
    if (rules === null || deltaSeconds === null) {
      throw new Error(
        "Ledger reached an event before its header; the rules are unknown."
      );
    }
    return { deltaSeconds, rules };
  };

  try {
    for (const record of records) {
      switch (record.type) {
        case "ledger.header": {
          deltaSeconds = 1 / record.tickRate;
          rules =
            record.kind === "duel"
              ? { kind: "duel", simulation: createDuelSimulation<ClientId>() }
              : { kind: "lobby", simulation: createSimulation<ClientId>() };
          break;
        }
        case "session.opened": {
          const { rules: current } = ready();
          if (current.kind === "duel") {
            current.simulation.join(record.clientId);
          } else {
            current.simulation.spawnPlayer(record.clientId);
          }
          break;
        }
        case "session.closed": {
          const { rules: current } = ready();
          if (current.kind === "duel") {
            current.simulation.leave(record.clientId);
          } else {
            current.simulation.removePlayer(record.clientId);
          }
          break;
        }
        case "tick": {
          const { rules: current, deltaSeconds: delta } = ready();
          if (current.kind !== "lobby") {
            throw new Error("A lobby tick in a duel ledger.");
          }
          for (const entry of record.inputs) {
            current.simulation.applyInput(entry.clientId, entry.input);
          }
          current.simulation.step(delta);
          ticks += 1;
          const actual = current.simulation.snapshot();
          if (!sameWorld(record.players, actual)) {
            return {
              divergence: {
                actual,
                expected: record.players,
                tick: record.tick,
              },
              ticks,
            };
          }
          break;
        }
        case "duel.tick": {
          const { rules: current, deltaSeconds: delta } = ready();
          if (current.kind !== "duel") {
            throw new Error("A duel tick in a lobby ledger.");
          }
          for (const entry of record.inputs) {
            if (entry.move !== null) {
              current.simulation.move(entry.clientId, entry.move);
            }
            if (entry.fire !== null) {
              current.simulation.fire(entry.clientId, entry.fire);
            }
            if (entry.rematch) {
              current.simulation.rematch(entry.clientId);
            }
          }
          current.simulation.step(delta);
          ticks += 1;
          const actual = current.simulation.snapshot();
          if (!sameDuel(record.snapshot, actual)) {
            return {
              divergence: {
                actual,
                expected: record.snapshot,
                tick: record.tick,
              },
              ticks,
            };
          }
          break;
        }
      }
    }
  } finally {
    rules?.simulation.dispose();
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
