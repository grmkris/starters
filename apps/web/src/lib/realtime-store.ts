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
import type { DuelEvent, Duelist, DuelSource } from "@agent-native/game-three";
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
  /** Seconds spent waiting to play anyone, or null when not waiting. */
  readonly waiting: number | null;
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
  waiting: null,
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

export class RealtimeStore implements DuelSource {
  readonly #metaListeners = new Set<() => void>();
  readonly #duelListeners = new Set<() => void>();
  readonly #eventListeners = new Set<(event: DuelEvent) => void>();
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
  /**
   * A duel the page asked for before the socket was open, or that must be
   * asked for again after a drop that happened before the room existed.
   */
  #duelRequest:
    | { readonly kind: "create" }
    | { readonly kind: "bot" }
    | { readonly kind: "queue" }
    | { readonly kind: "find"; readonly code: RoomCode }
    | null = null;
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

  readonly getDuelist = (clientId: string): Duelist | undefined => {
    const player = this.#duel.players.find(
      (candidate) => candidate.clientId === clientId
    );
    return player === undefined
      ? undefined
      : { health: player.health, side: player.side };
  };

  /**
   * The moments between one snapshot and the next: a shot born, banked,
   * across the seam, landed; a round or a match decided. Derived here, once,
   * so the renderer, the sound and the vibration agree on what happened.
   */
  readonly subscribeEvents = (
    listener: (event: DuelEvent) => void
  ): (() => void) => {
    this.#eventListeners.add(listener);
    return () => {
      this.#eventListeners.delete(listener);
    };
  };

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
    } else if (this.#duelRequest !== null) {
      this.#sendDuelRequest();
    }
  }

  /** Asks for `roomId` now and again on every reconnect. */
  joinRoom(roomId: RoomId): void {
    this.#room = roomId;
    this.#duelRequest = null;
    this.#sendJoin(roomId);
  }

  /** Gives the room back. A page leaving is the one thing that ends a duel. */
  leaveRoom(): void {
    const wasIn = this.#room;
    this.#room = null;
    this.#duelRequest = null;
    this.#updateDuel(initialDuel);
    if (wasIn !== null) {
      this.#send({
        seq: this.#nextSequence(),
        type: "room.leave",
        v: PROTOCOL_VERSION,
      });
    }
  }

  /** Asks the server for a fresh duel; `duel.created` joins it. */
  createDuel(): void {
    this.#room = null;
    this.#duelRequest = { kind: "create" };
    this.#updateDuel(initialDuel);
    this.#sendDuelRequest();
  }

  /** Resolves a code somebody read out; `duel.found` joins it. */
  findDuel(code: RoomCode): void {
    this.#room = null;
    this.#duelRequest = { code, kind: "find" };
    this.#updateDuel({ ...initialDuel, code });
    this.#sendDuelRequest();
  }

  /** Waits for anyone; `duel.matched` joins the room the server makes. */
  queueDuel(): void {
    this.#room = null;
    this.#duelRequest = { kind: "queue" };
    this.#updateDuel({ ...initialDuel, waiting: 0 });
    this.#sendDuelRequest();
  }

  /** Stops waiting. Nothing else changes; the page is still the landing. */
  dequeueDuel(): void {
    this.#duelRequest = null;
    this.#updateDuel({ ...this.#duel, waiting: null });
    this.#send({
      seq: this.#nextSequence(),
      type: "duel.dequeue",
      v: PROTOCOL_VERSION,
    });
  }

  /** Asks for a room with the bot in it; `duel.created` joins it. */
  botDuel(): void {
    this.#room = null;
    this.#duelRequest = { kind: "bot" };
    this.#updateDuel(initialDuel);
    this.#sendDuelRequest();
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
      case "duel.waiting": {
        this.#updateDuel({ ...this.#duel, waiting: message.seconds });
        break;
      }
      case "duel.matched": {
        this.#updateDuel({
          ...this.#duel,
          code: message.code,
          roomId: message.roomId,
          waiting: null,
        });
        this.joinRoom(message.roomId);
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

  #sendDuelRequest(): void {
    const request = this.#duelRequest;
    if (request === null) {
      return;
    }
    switch (request.kind) {
      case "create": {
        this.#send({
          seq: this.#nextSequence(),
          type: "duel.create",
          v: PROTOCOL_VERSION,
        });
        return;
      }
      case "bot": {
        this.#send({
          seq: this.#nextSequence(),
          type: "duel.bot",
          v: PROTOCOL_VERSION,
        });
        return;
      }
      case "queue": {
        this.#send({
          seq: this.#nextSequence(),
          type: "duel.queue",
          v: PROTOCOL_VERSION,
        });
        return;
      }
      case "find": {
        this.#send({
          code: request.code,
          seq: this.#nextSequence(),
          type: "duel.join",
          v: PROTOCOL_VERSION,
        });
      }
    }
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
    this.#announceMoments(message);
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

  /** Diffs the incoming snapshot against the last one and emits the events. */
  #announceMoments(
    next: Extract<ServerMessage, { readonly type: "duel.snapshot" }>
  ): void {
    if (this.#eventListeners.size === 0) {
      return;
    }
    const before = new Map(
      this.#projectiles.map((shot) => [shot.id, shot] as const)
    );
    for (const shot of next.projectiles) {
      const was = before.get(shot.id);
      const at = { x: shot.position.x, z: shot.position.z };
      if (was === undefined) {
        this.#emit({ at, id: shot.id, kind: "fire", ownerId: shot.ownerId });
        continue;
      }
      if (
        shot.velocity.z !== 0 &&
        Math.sign(was.velocity.z) !== Math.sign(shot.velocity.z)
      ) {
        this.#emit({ at, id: shot.id, kind: "bounce" });
      }
      if (Math.sign(was.position.x) !== Math.sign(shot.position.x)) {
        this.#emit({ at, id: shot.id, kind: "cross", ownerId: shot.ownerId });
      }
    }

    for (const player of next.players) {
      const was = this.#duel.players.find(
        (candidate) => candidate.clientId === player.clientId
      );
      if (was !== undefined && player.health < was.health) {
        const by =
          next.players.find(
            (candidate) => candidate.clientId !== player.clientId
          )?.clientId ?? player.clientId;
        this.#emit({
          at: { x: player.position.x, z: player.position.z },
          by,
          clientId: player.clientId,
          kind: "hit",
        });
      }
    }

    if (next.phase === "roundOver" && this.#duel.phase !== "roundOver") {
      this.#emit({ kind: "round", winner: next.winner });
    }
    if (next.phase === "matchOver" && this.#duel.phase !== "matchOver") {
      this.#emit({ kind: "match", winner: next.winner });
    }
  }

  #emit(event: DuelEvent): void {
    for (const listener of this.#eventListeners) {
      listener(event);
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
