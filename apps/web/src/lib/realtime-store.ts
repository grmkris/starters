import { LOBBY_ROOM_ID, PROTOCOL_VERSION } from "@agent-native/domain";
import type {
  ClientId,
  MovementInput,
  ResumeToken,
} from "@agent-native/domain";
import type { WorldSource } from "@agent-native/game-three";
import { encodeClientMessage, ResumeClaim } from "@agent-native/protocol";
import type { ClientMessage, ServerMessage } from "@agent-native/protocol";
import { Result, Schema } from "effect";

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

/** The part of Web Storage the store needs, so a test can hand it a Map. */
export interface IdentityStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

/**
 * The part of a socket the store writes to, so a test can hand it a stub. The
 * store only ever sends encoded JSON, so `send` takes a string; a WebSocket,
 * which accepts more, still satisfies it.
 */
export interface OutboundSocket {
  readonly readyState: number;
  readonly send: (data: string) => void;
}

type JoinMessage = Extract<ClientMessage, { readonly type: "room.join" }>;

const IDENTITY_KEY = "field01.identity";

const IdentityRecord = Schema.fromJsonString(ResumeClaim);
const decodeIdentity = Schema.decodeUnknownResult(IdentityRecord);
const encodeIdentity = Schema.encodeSync(IdentityRecord);

/**
 * `sessionStorage` has exactly the scope an identity has: a reload keeps it,
 * a second tab is a second player, and closing the tab lets the server's
 * claim expire. Reading it can throw in a sandboxed document, in which case
 * the tab simply gets a fresh identity per connection.
 */
const browserStorage = (): IdentityStorage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

export class RealtimeStore implements WorldSource {
  readonly #metaListeners = new Set<() => void>();
  readonly #positions = new Map<string, { x: number; y: number; z: number }>();
  readonly #rosterListeners = new Set<() => void>();
  readonly #storage: IdentityStorage | null;
  #meta = initialMeta;
  /** Last vector actually put on the wire, so unchanged input is not resent. */
  #lastInput: MovementInput = { x: 0, z: 0 };
  #roster: readonly string[] = [];
  #sequence = 0;
  #socket: OutboundSocket | null = null;
  /** What the next `room.join` presents. Null until a join has succeeded. */
  #identity: ResumeClaim | null;
  /** The token the current connection was welcomed with. */
  #offeredToken: ResumeToken | null = null;

  constructor(storage: IdentityStorage | null = browserStorage()) {
    this.#storage = storage;
    this.#identity = this.#restoreIdentity();
  }

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

  attach(socket: OutboundSocket): void {
    this.#socket = socket;
    // A fresh connection carries no input state on the server, so the dedupe
    // cache has to reset with it or a held key would never be re-announced.
    this.#lastInput = { x: 0, z: 0 };
    this.#updateMeta({ lastError: null, status: "live" });
    const join: JoinMessage = {
      roomId: LOBBY_ROOM_ID,
      seq: this.#nextSequence(),
      type: "room.join",
      v: PROTOCOL_VERSION,
    };
    this.#send(
      this.#identity === null ? join : { ...join, resume: this.#identity }
    );
  }

  /**
   * `socket` identifies the attempt being torn down. A superseded attempt must
   * not clear a connection that a later one has already established, which is
   * otherwise reachable whenever two attempts overlap - React StrictMode
   * remounts the effect, so it happens on every dev boot.
   */
  detach(message: string | null = null, socket?: OutboundSocket): void {
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

  /**
   * The server gave this identity to another connection. Presenting the claim
   * again would only take it back, so the next join asks for a fresh one.
   */
  forgetIdentity(): void {
    this.#identity = null;
    try {
      this.#storage?.removeItem(IDENTITY_KEY);
    } catch {
      // Storage that cannot be written was never read either.
    }
  }

  /** Surface a fault that did not close the socket, such as an undecodable frame. */
  reportError(message: string): void {
    this.#updateMeta({ lastError: message, status: "error" });
  }

  apply(message: ServerMessage): void {
    switch (message.type) {
      case "session.welcome": {
        // Identity waits for `room.joined`, which names the one the world
        // actually uses; the welcome's is provisional until then.
        this.#offeredToken = message.resumeToken;
        this.#updateMeta({ status: "live", tickRate: message.tickRate });
        break;
      }
      case "room.presence": {
        this.#updateMeta({ connected: message.connected });
        break;
      }
      case "room.joined": {
        this.#updateMeta({
          clientId: message.clientId,
          connected: message.connected,
          status: "live",
        });
        if (this.#offeredToken !== null) {
          this.#rememberIdentity({
            clientId: message.clientId,
            resumeToken: this.#offeredToken,
          });
        }
        break;
      }
      // `room.left` and `room.rejected` describe a room lifecycle this store
      // does not yet model. A refusal is surfaced because the operator should
      // see it; a departure clears the world rather than being dropped.
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

  #rememberIdentity(identity: ResumeClaim): void {
    this.#identity = identity;
    try {
      this.#storage?.setItem(IDENTITY_KEY, encodeIdentity(identity));
    } catch {
      // A full or forbidden store costs the reload case only; the identity is
      // still held in memory for a reconnect within this page.
    }
  }

  #restoreIdentity(): ResumeClaim | null {
    let stored: string | null;
    try {
      stored = this.#storage?.getItem(IDENTITY_KEY) ?? null;
    } catch {
      return null;
    }
    if (stored === null) {
      return null;
    }
    // Decoded rather than trusted: storage is writable by anything on the
    // origin, and a malformed claim would otherwise fail on the wire instead.
    const decoded = decodeIdentity(stored);
    return Result.isSuccess(decoded) ? decoded.success : null;
  }

  #nextSequence(): number {
    this.#sequence += 1;
    return this.#sequence;
  }

  #send(message: ClientMessage): void {
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
