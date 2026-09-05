import { PROTOCOL_VERSION } from "@agent-native/domain";
import type {
  ClientId,
  DuelPhase,
  DuelPlayerSnapshot,
  MovementInput,
  ProjectileSnapshot,
  ResumeToken,
  RoomCode,
  RoomId,
  Side,
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

/** The duel as the page reads it. `phase` is null outside a duel room. */
export interface DuelMeta {
  readonly code: RoomCode | null;
  readonly countdown: number;
  readonly error: string | null;
  readonly phase: DuelPhase | null;
  readonly players: readonly DuelPlayerSnapshot[];
  readonly roomId: RoomId | null;
  readonly round: number;
  readonly side: Side | null;
  readonly winner: Side | null;
}

const initialDuel: DuelMeta = {
  code: null,
  countdown: 0,
  error: null,
  phase: null,
  players: [],
  roomId: null,
  round: 0,
  side: null,
  winner: null,
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
  readonly #duelListeners = new Set<() => void>();
  readonly #positions = new Map<string, { x: number; y: number; z: number }>();
  readonly #rosterListeners = new Set<() => void>();
  readonly #storage: IdentityStorage | null;
  #meta = initialMeta;
  #duel = initialDuel;
  #projectiles: readonly ProjectileSnapshot[] = [];
  /** Last vector actually put on the wire, so unchanged input is not resent. */
  #lastInput: MovementInput = { x: 0, z: 0 };
  #roster: readonly string[] = [];
  #sequence = 0;
  #socket: OutboundSocket | null = null;
  /**
   * The room this page wants to be in. Set by the page, sent on every attach,
   * so a reconnect lands back where the page was rather than in a default.
   */
  #room: RoomId | null = null;
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

  readonly subscribeDuel = (listener: () => void): (() => void) => {
    this.#duelListeners.add(listener);
    return () => {
      this.#duelListeners.delete(listener);
    };
  };

  readonly getDuelSnapshot = (): DuelMeta => this.#duel;

  readonly subscribeRoster = (listener: () => void): (() => void) => {
    this.#rosterListeners.add(listener);
    return () => {
      this.#rosterListeners.delete(listener);
    };
  };

  readonly getRosterSnapshot = (): readonly string[] => this.#roster;

  readonly getPosition = (clientId: string) => this.#positions.get(clientId);

  /** Every shot in flight as of the last snapshot, for the renderer. */
  readonly getProjectiles = (): readonly ProjectileSnapshot[] =>
    this.#projectiles;

  setConnecting(): void {
    this.#updateMeta({ lastError: null, status: "connecting" });
  }

  attach(socket: OutboundSocket): void {
    this.#socket = socket;
    // A fresh connection carries no input state on the server, so the dedupe
    // cache has to reset with it or a held key would never be re-announced.
    this.#lastInput = { x: 0, z: 0 };
    this.#updateMeta({ lastError: null, status: "live" });
    if (this.#room !== null) {
      this.#sendJoin(this.#room);
    }
  }

  /** Asks for `roomId` now and again on every reconnect. */
  joinRoom(roomId: RoomId): void {
    this.#room = roomId;
    this.#sendJoin(roomId);
  }

  /** Asks the server for a fresh duel; `duel.created` joins it. */
  createDuel(): void {
    this.#updateDuel({ ...initialDuel });
    this.#send({
      seq: this.#nextSequence(),
      type: "duel.create",
      v: PROTOCOL_VERSION,
    });
  }

  /** Resolves a code somebody read out; `duel.found` joins it. */
  findDuel(code: RoomCode): void {
    this.#updateDuel({ ...initialDuel, code });
    this.#send({
      code,
      seq: this.#nextSequence(),
      type: "duel.join",
      v: PROTOCOL_VERSION,
    });
  }

  duelMove(target: number): void {
    this.#send({
      move: { target },
      seq: this.#nextSequence(),
      type: "duel.move",
      v: PROTOCOL_VERSION,
    });
  }

  duelFire(angle: number): void {
    this.#send({
      fire: { angle },
      seq: this.#nextSequence(),
      type: "duel.fire",
      v: PROTOCOL_VERSION,
    });
  }

  duelRematch(): void {
    this.#send({
      seq: this.#nextSequence(),
      type: "duel.rematch",
      v: PROTOCOL_VERSION,
    });
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
      case "duel.created": {
        this.#updateDuel({
          ...this.#duel,
          code: message.code,
          roomId: message.roomId,
        });
        this.joinRoom(message.roomId);
        break;
      }
      case "duel.found": {
        this.#updateDuel({ ...this.#duel, roomId: message.roomId });
        this.joinRoom(message.roomId);
        break;
      }
      case "duel.notFound": {
        this.#updateDuel({
          ...this.#duel,
          error: `No duel is waiting behind ${message.code}`,
        });
        break;
      }
      case "duel.snapshot": {
        this.#applyDuelSnapshot(message);
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

  #sendJoin(roomId: RoomId): void {
    const join: JoinMessage = {
      roomId,
      seq: this.#nextSequence(),
      type: "room.join",
      v: PROTOCOL_VERSION,
    };
    this.#send(
      this.#identity === null ? join : { ...join, resume: this.#identity }
    );
  }

  #applyWorldSnapshot(
    message: Extract<ServerMessage, { readonly type: "world.snapshot" }>
  ): void {
    this.#replaceRoster(message.players);
    this.#meta = { ...this.#meta, tick: message.tick };
    if (message.tick % this.#meta.tickRate === 0) {
      for (const listener of this.#metaListeners) {
        listener();
      }
    }
  }

  #applyDuelSnapshot(
    message: Extract<ServerMessage, { readonly type: "duel.snapshot" }>
  ): void {
    this.#replaceRoster(message.players);
    this.#projectiles = message.projectiles;
    this.#meta = { ...this.#meta, tick: message.tick };
    const me = message.players.find(
      (player) => player.clientId === this.#meta.clientId
    );
    this.#updateDuel({
      ...this.#duel,
      countdown: message.countdown,
      phase: message.phase,
      players: message.players,
      roomId: message.roomId,
      round: message.round,
      side: me?.side ?? null,
      winner: message.winner,
    });
  }

  /** Positions for the renderer, and the roster only when it changed. */
  #replaceRoster(
    players: readonly {
      readonly clientId: ClientId;
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
    }[]
  ): void {
    const nextRoster = players.map((player) => player.clientId).toSorted();
    const rosterChanged =
      nextRoster.length !== this.#roster.length ||
      nextRoster.some((clientId, index) => clientId !== this.#roster[index]);

    this.#positions.clear();
    for (const player of players) {
      this.#positions.set(player.clientId, { ...player.position });
    }

    if (rosterChanged) {
      this.#roster = nextRoster;
      for (const listener of this.#rosterListeners) {
        listener();
      }
    }
  }

  #clearWorld(): void {
    this.#positions.clear();
    this.#projectiles = [];
    if (this.#duel.phase !== null) {
      this.#updateDuel({ ...this.#duel, phase: null, players: [] });
    }
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

  #updateDuel(next: DuelMeta): void {
    this.#duel = next;
    for (const listener of this.#duelListeners) {
      listener();
    }
  }
}

export const realtimeStore = new RealtimeStore();
