import { PROTOCOL_VERSION } from "@agent-native/domain";
import type { MovementInput } from "@agent-native/domain";
import type { WorldSource } from "@agent-native/game-three";
import { encodeClientMessage } from "@agent-native/protocol";
import type { ServerMessage } from "@agent-native/protocol";

type ConnectionStatus = "connecting" | "live" | "offline" | "error";

export interface RealtimeMeta {
  readonly clientId: string | null;
  readonly connected: number;
  readonly latencyMs: number | null;
  readonly lastError: string | null;
  readonly status: ConnectionStatus;
  readonly tick: number;
  readonly tickRate: number;
}

const initialMeta: RealtimeMeta = {
  clientId: null,
  connected: 0,
  lastError: null,
  latencyMs: null,
  status: "offline",
  tick: 0,
  tickRate: 20,
};

export class RealtimeStore implements WorldSource {
  readonly #metaListeners = new Set<() => void>();
  readonly #positions = new Map<string, { x: number; y: number; z: number }>();
  readonly #rosterListeners = new Set<() => void>();
  #meta = initialMeta;
  #roster: readonly string[] = [];
  #sequence = 0;
  #socket: WebSocket | null = null;

  readonly subscribeMeta = (listener: () => void): (() => void) => {
    this.#metaListeners.add(listener);
    return () => {
      this.#metaListeners.delete(listener);
    };
  };

  readonly getMetaSnapshot = (): RealtimeMeta => this.#meta;

  readonly subscribeRoster = (listener: () => void): (() => void) => {
    this.#rosterListeners.add(listener);
    return () => {
      this.#rosterListeners.delete(listener);
    };
  };

  readonly getRosterSnapshot = (): readonly string[] => this.#roster;

  readonly getPosition = (clientId: string) => this.#positions.get(clientId);

  setConnecting(): void {
    this.#updateMeta({ lastError: null, status: "connecting" });
  }

  attach(socket: WebSocket): void {
    this.#socket = socket;
    this.#updateMeta({ lastError: null, status: "live" });
    this.#send({
      roomId: "lobby",
      seq: this.#nextSequence(),
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
  }

  detach(message: string | null = null): void {
    this.#socket = null;
    this.#updateMeta({
      lastError: message,
      status: message === null ? "offline" : "error",
    });
  }

  apply(message: ServerMessage): void {
    switch (message.type) {
      case "session.welcome": {
        this.#updateMeta({
          clientId: message.clientId,
          status: "live",
          tickRate: message.tickRate,
        });
        break;
      }
      case "room.presence": {
        this.#updateMeta({ connected: message.connected });
        break;
      }
      case "world.snapshot": {
        this.#applyWorldSnapshot(message);
        break;
      }
      case "pong": {
        this.#updateMeta({
          latencyMs: Math.max(0, Date.now() - message.sentAt),
        });
        break;
      }
      case "protocol.error": {
        this.#updateMeta({ lastError: message.message, status: "error" });
        break;
      }
    }
  }

  sendInput(input: MovementInput): void {
    this.#send({
      input,
      roomId: "lobby",
      seq: this.#nextSequence(),
      type: "player.input",
      v: PROTOCOL_VERSION,
    });
  }

  ping(): void {
    this.#send({
      sentAt: Date.now(),
      seq: this.#nextSequence(),
      type: "ping",
      v: PROTOCOL_VERSION,
    });
  }

  #applyWorldSnapshot(
    message: Extract<ServerMessage, { readonly type: "world.snapshot" }>
  ): void {
    const nextRoster = message.players
      .map((player) => player.clientId)
      .toSorted();
    const rosterChanged =
      nextRoster.length !== this.#roster.length ||
      nextRoster.some((clientId, index) => clientId !== this.#roster[index]);

    this.#positions.clear();
    for (const player of message.players) {
      this.#positions.set(player.clientId, { ...player.position });
    }

    if (rosterChanged) {
      this.#roster = nextRoster;
      for (const listener of this.#rosterListeners) {
        listener();
      }
    }

    this.#meta = { ...this.#meta, tick: message.tick };
    if (message.tick % this.#meta.tickRate === 0) {
      for (const listener of this.#metaListeners) {
        listener();
      }
    }
  }

  #nextSequence(): number {
    this.#sequence += 1;
    return this.#sequence;
  }

  #send(message: Parameters<typeof encodeClientMessage>[0]): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(encodeClientMessage(message));
    }
  }

  #updateMeta(patch: Partial<RealtimeMeta>): void {
    this.#meta = { ...this.#meta, ...patch };
    for (const listener of this.#metaListeners) {
      listener();
    }
  }
}

export const realtimeStore = new RealtimeStore();
