import { PROTOCOL_VERSION } from "@agent-native/domain";
import type { ClientId, ResumeToken, RoomId } from "@agent-native/domain";
import {
  decodeServerMessage,
  encodeClientMessage,
} from "@agent-native/protocol";
import type { ClientMessage, ServerMessage } from "@agent-native/protocol";
import { Result } from "effect";

import { createRealtimeServer, RESUME_TTL_MS } from "../src/index";
import type { ServerResource } from "../src/index";

/**
 * Drives the real server over real WebSockets.
 *
 * Three properties matter more than the surface. Messages are buffered from the
 * moment the socket opens, so a waiter resolves from history rather than from a
 * listener registered afterwards - the server sends `session.welcome`
 * immediately, and a test subscribing after `connect()` returns would miss it.
 * Waiting is a predicate rather than a poll, so no test spins a loop reading
 * ticks. And nothing sleeps: every wait is an event, so the suite does not
 * trade wall-clock for flakiness.
 */

const DEFAULT_TIMEOUT_MS = 5000;

type OfType<Type extends ServerMessage["type"]> = Extract<
  ServerMessage,
  { readonly type: Type }
>;

/** Narrows by the discriminant, so no test needs an assertion to read a field. */
const isType = <Type extends ServerMessage["type"]>(
  message: ServerMessage,
  type: Type
): message is OfType<Type> => message.type === type;

export interface TestClient {
  readonly received: readonly ServerMessage[];
  readonly send: (message: ClientMessage) => void;
  /** First message of `type` satisfying `matches`, counting from the last hit. */
  readonly until: <Type extends ServerMessage["type"]>(
    type: Type,
    matches: (message: OfType<Type>) => boolean,
    timeoutMs?: number
  ) => Promise<OfType<Type>>;
  readonly next: <Type extends ServerMessage["type"]>(
    type: Type,
    timeoutMs?: number
  ) => Promise<OfType<Type>>;
  readonly close: () => Promise<void>;
  /** Resolves with the close code once the socket closes, whoever closed it. */
  readonly closed: Promise<number>;
}

interface JoinedClient {
  readonly client: TestClient;
  readonly clientId: ClientId;
  readonly resumeToken: ResumeToken;
}

export interface Harness {
  readonly url: string;
  readonly port: number;
  readonly resource: ServerResource;
  readonly connect: () => Promise<TestClient>;
  /** Connects, waits for identity, joins `roomId`, waits for the acknowledgement. */
  readonly join: (roomId: RoomId) => Promise<JoinedClient>;
  readonly close: () => Promise<void>;
}

/**
 * Bridges an EventTarget to a promise. `promise/avoid-new` asks for an existing
 * library promise instead, and for DOM-style events there is none - this is the
 * construction the rule exists to make deliberate rather than accidental.
 */
const openSocket = async (url: string): Promise<WebSocket> => {
  const socket = new WebSocket(url);
  // oxlint-disable-next-line promise/avoid-new -- bridging an EventTarget
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve();
    });
    socket.addEventListener("error", () => {
      reject(new Error(`Could not open a test socket to ${url}`));
    });
  });
  return socket;
};

const connectClient = async (url: string): Promise<TestClient> => {
  const received: ServerMessage[] = [];
  const undecodable: string[] = [];
  const waiters = new Set<() => void>();
  // Per-type read cursors held on the client, so awaiting one type twice yields
  // two different messages. A cursor local to a call would re-read the first
  // `room.presence` when a test waits for the second and report a stale count.
  const cursors = new Map<ServerMessage["type"], number>();

  const socket = await openSocket(url);

  // oxlint-disable-next-line promise/avoid-new -- bridging an EventTarget
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => {
      resolve(event.code);
    });
  });

  socket.addEventListener("message", (event) => {
    const decoded = decodeServerMessage(event.data);
    if (Result.isSuccess(decoded)) {
      received.push(decoded.success);
    } else {
      undecodable.push(String(event.data));
    }
    for (const wake of waiters) {
      wake();
    }
  });

  const until = async <Type extends ServerMessage["type"]>(
    type: Type,
    matches: (message: OfType<Type>) => boolean,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<OfType<Type>> => {
    const search = (): OfType<Type> | undefined => {
      let cursor = cursors.get(type) ?? 0;
      let found: OfType<Type> | undefined;
      while (cursor < received.length && found === undefined) {
        const message = received[cursor];
        cursor += 1;
        if (
          message !== undefined &&
          isType(message, type) &&
          matches(message)
        ) {
          found = message;
        }
      }
      cursors.set(type, cursor);
      return found;
    };

    const immediate = search();
    if (immediate !== undefined) {
      return immediate;
    }

    // oxlint-disable-next-line promise/avoid-new -- bridging an EventTarget
    return await new Promise<OfType<Type>>((resolve, reject) => {
      // The timer settles the promise without needing to reach the waiter, so
      // the two never reference each other and the ordering stays trivial.
      const pending = { active: true };

      const timer = setTimeout(() => {
        pending.active = false;
        // The whole log, because a bare timeout costs a rerun to diagnose.
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for "${type}". Received: ${JSON.stringify(received)}. Undecodable: ${JSON.stringify(undecodable)}`
          )
        );
      }, timeoutMs);

      const wake = (): void => {
        if (!pending.active) {
          waiters.delete(wake);
          return;
        }
        const message = search();
        if (message === undefined) {
          return;
        }
        pending.active = false;
        clearTimeout(timer);
        waiters.delete(wake);
        resolve(message);
      };

      waiters.add(wake);
    });
  };

  const close = async (): Promise<void> => {
    if (socket.readyState === WebSocket.CLOSED) {
      return;
    }
    // Awaited, because server.stop(true) force-closes sockets and would race
    // an assertion about the close handler.
    socket.close(1000, "test complete");
    await closed;
  };

  return {
    close,
    closed,
    next: async (type, timeoutMs) => await until(type, () => true, timeoutMs),
    received,
    send: (message) => {
      socket.send(encodeClientMessage(message));
    },
    until,
  };
};

export interface HarnessOptions {
  /** Null, the default, records nothing. */
  readonly ledgerDirectory?: string | null;
  /** Overrides the resume window so a test can see it close without waiting a minute. */
  readonly resumeTtlMs?: number;
}

/** Starts a server on an ephemeral port. Never reads the environment. */
export const startHarness = ({
  ledgerDirectory = null,
  resumeTtlMs = RESUME_TTL_MS,
}: HarnessOptions = {}): Harness => {
  const resource = createRealtimeServer({
    ledgerDirectory,
    port: 0,
    resumeTtlMs,
  });
  const { port } = resource.server;
  if (port === undefined) {
    // Bun reports no port for a unix socket; this harness always binds TCP.
    throw new Error("Harness server bound without a TCP port");
  }

  return {
    // The same teardown the Effect release path uses, so a test cannot drift
    // from production shutdown.
    close: async () => {
      await resource.dispose();
    },
    connect: async () => await connectClient(`ws://127.0.0.1:${port}/realtime`),
    join: async (roomId) => {
      const client = await connectClient(`ws://127.0.0.1:${port}/realtime`);
      const welcome = await client.next("session.welcome");
      client.send({
        roomId,
        seq: 1,
        type: "room.join",
        v: PROTOCOL_VERSION,
      });
      const joined = await client.next("room.joined");
      return {
        client,
        clientId: joined.clientId,
        resumeToken: welcome.resumeToken,
      };
    },
    port,
    resource,
    url: `ws://127.0.0.1:${port}/realtime`,
  };
};

/** Sends a frame the protocol codec would never produce. */
export const sendRaw = async (url: string, payload: string): Promise<void> => {
  const socket = await openSocket(url);
  socket.send(payload);
};
