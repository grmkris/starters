import { LOBBY_ROOM_ID, PROTOCOL_VERSION } from "@agent-native/domain";
import type { ClientId, MovementInput } from "@agent-native/domain";
import type { WorldSource } from "@agent-native/game-three";
import { encodeClientMessage } from "@agent-native/protocol";
import type { ServerMessage } from "@agent-native/protocol";

export type ConnectionStatus = "connecting" | "live" | "offline" | "error";

export interface RealtimeMeta {
  readonly clientId: ClientId | null;
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
  /** Last vector actually put on the wire, so unchanged input is not resent. */
  #lastInput: MovementInput = { x: 0, z: 0 };
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
    // A fresh connection carries no input state on the server, so the dedupe
    // cache has to reset with it or a held key would never be re-announced.
    this.#lastInput = { x: 0, z: 0 };
    this.#updateMeta({ lastError: null, status: "live" });
    this.#send({
      roomId: LOBBY_ROOM_ID,
      seq: this.#nextSequence(),
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
  }

  /**
   * `socket` identifies the attempt being torn down. A superseded attempt must
   * not clear a connection that a later one has already established, which is
   * otherwise reachable whenever two attempts overlap - React StrictMode
   * remounts the effect, so it happens on every dev boot.
   */
  detach(message: string | null = null, socket?: WebSocket): void {
    if (
      socket !== undefined &&
      this.#socket !== null &&
      this.#socket !== socket
    ) {
      return;
    }
    this.#socket = null;
    // While disconnected the world is unknown. Continuing to render the last
    // snapshot shows entities that may already be gone.
    this.#clearWorld();
    this.#updateMeta({
      lastError: message,
      status: message === null ? "offline" : "error",
    });
  }

  /** Surface a fault that did not close the socket, such as an undecodable frame. */
  reportError(message: string): void {
    this.#updateMeta({ lastError: message, status: "error" });
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
      // Membership now begins at `room.join` rather than at the upgrade, so
      // these three describe a room lifecycle this store does not yet model.
      // Modelling it belongs with the connection state machine, not here; a
      // refusal is surfaced because the operator should see it, and the other
      // two are acknowledged rather than silently dropped.
      case "room.joined": {
        this.#updateMeta({ connected: message.connected, status: "live" });
        break;
      }
      case "room.left": {
        this.#clearWorld();
        break;
      }
      case "room.rejected": {
        this.#updateMeta({
          lastError: `Room refused the connection: ${message.reason}`,
          status: "error",
        });
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
    if (input.x === this.#lastInput.x && input.z === this.#lastInput.z) {
      return;
    }
    this.#lastInput = input;
    this.#send({
      input,
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

  #clearWorld(): void {
    this.#positions.clear();
    if (this.#roster.length === 0) {
      return;
    }
    this.#roster = [];
    for (const listener of this.#rosterListeners) {
      listener();
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
