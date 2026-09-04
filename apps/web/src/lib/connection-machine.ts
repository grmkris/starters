import { Schema } from "effect";
import { Event, Machine, State } from "effect-machine";

/**
 * A connection that stayed up this long counts as a session rather than a
 * failed attempt. Without a threshold, a server that accepts and immediately
 * drops would look like repeated success and reconnect with no delay at all.
 */
export const STABLE_SESSION_MS = 2000;

/**
 * The states one connection attempt can occupy.
 *
 * `openedAt` lives only in `Open` because that is the only state where it means
 * anything. The previous shape carried it as `number | null` alongside a
 * `settled` boolean, which is the same information spread across two fields
 * that could disagree with each other.
 */
export const ConnectionState = State({
  Connecting: {},
  Open: { openedAt: Schema.Finite },
  Ended: {},
  Failed: { message: Schema.String },
});

export const ConnectionEvent = Event({
  Opened: { at: Schema.Finite },
  SocketClosed: { at: Schema.Finite },
  TransportError: { message: Schema.String },
});

const CLOSED_BEFORE_SESSION = "Realtime transport closed";

/**
 * Socket lifecycle as a state machine. Retry policy deliberately stays outside
 * it: `Schedule`, `Effect.retry` and `Effect.forever` in `realtime-client`
 * still own when another attempt happens. This models only which states exist
 * and which transitions are legal, so a second `Opened` or a late
 * `TransportError` after the attempt finished has nowhere to go rather than
 * being blocked by a flag.
 *
 * A close before `STABLE_SESSION_MS` is a *failure*, not a clean end. That is
 * what puts the attempt back through the backoff schedule; treating it as
 * success would restart immediately and rebuild the storm the threshold exists
 * to prevent.
 */
export const connectionMachine = Machine.make({
  state: ConnectionState,
  event: ConnectionEvent,
  initial: ConnectionState.Connecting,
})
  .on(ConnectionState.Connecting, ConnectionEvent.Opened, ({ event }) =>
    ConnectionState.Open({ openedAt: event.at })
  )
  .on(ConnectionState.Connecting, ConnectionEvent.SocketClosed, () =>
    ConnectionState.Failed({ message: CLOSED_BEFORE_SESSION })
  )
  .on(ConnectionState.Connecting, ConnectionEvent.TransportError, ({ event }) =>
    ConnectionState.Failed({ message: event.message })
  )
  .when(
    ConnectionState.Open,
    ConnectionEvent.SocketClosed,
    ({ event, state }) => event.at - state.openedAt >= STABLE_SESSION_MS,
    () => ConnectionState.Ended
  )
  .on(ConnectionState.Open, ConnectionEvent.SocketClosed, () =>
    ConnectionState.Failed({ message: CLOSED_BEFORE_SESSION })
  )
  .on(ConnectionState.Open, ConnectionEvent.TransportError, ({ event }) =>
    ConnectionState.Failed({ message: event.message })
  )
  .final(ConnectionState.Ended, ({ state }) => state)
  .final(ConnectionState.Failed, ({ state }) => state);
