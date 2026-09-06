import type { ClientId, RoomId } from "@agent-native/domain";
import { MAX_FIRE_ANGLE, PLAYER_X } from "@agent-native/game-core";
import {
  decodeServerMessage,
  encodeClientMessage,
} from "@agent-native/protocol";
import type { ClientMessage, ServerMessage } from "@agent-native/protocol";
import { Result } from "effect";

/**
 * An opponent that is a client like any other.
 *
 * The bot opens a socket to the server it lives in and plays over the
 * protocol, so the rules never know it exists and its intent is ordinary
 * intent in the ledger. Its policy has no randomness and is driven only by
 * the tick numbers in the snapshots it receives, so a recorded match against
 * it replays exactly.
 *
 * Beatable on purpose: it follows the opponent a few ticks late, fires on a
 * fixed rhythm, and only every other shot leads the target.
 */

export interface BotOptions {
  readonly url: string;
  readonly roomId: RoomId;
}

export interface Bot {
  /** Closes the bot's socket. The room sees an ordinary departure. */
  readonly stop: () => void;
}

/** Ticks between lane updates; the lag that lets a quick move get a shot past it. */
const FOLLOW_EVERY_TICKS = 6;
/** Ticks between shots; twice the cooldown, so it never fires as fast as it could. */
const FIRE_EVERY_TICKS = 16;

type ClientMessageBody = ClientMessage extends infer Message
  ? Message extends ClientMessage
    ? Omit<Message, "seq">
    : never
  : never;

type DuelSnapshotMessage = Extract<
  ServerMessage,
  { readonly type: "duel.snapshot" }
>;

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value));

export const startBot = ({ roomId, url }: BotOptions): Bot => {
  const socket = new WebSocket(url);
  let sequence = 0;
  let me: ClientId | null = null;
  let lastMoveTick = Number.NEGATIVE_INFINITY;
  let lastFireTick = Number.NEGATIVE_INFINITY;
  let askedForRematch = false;

  const say = (body: ClientMessageBody): void => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    sequence += 1;
    socket.send(encodeClientMessage({ ...body, seq: sequence }));
  };

  const play = (snapshot: DuelSnapshotMessage): void => {
    if (me === null) {
      return;
    }
    const mine = snapshot.players.find((player) => player.clientId === me);
    const theirs = snapshot.players.find((player) => player.clientId !== me);

    if (snapshot.phase === "matchOver") {
      // Always up for another. The human decides when it happens.
      if (!askedForRematch) {
        askedForRematch = true;
        say({ type: "duel.rematch", v: 1 });
      }
      return;
    }
    askedForRematch = false;

    if (
      snapshot.phase !== "playing" ||
      mine === undefined ||
      theirs === undefined
    ) {
      return;
    }

    if (snapshot.tick - lastMoveTick >= FOLLOW_EVERY_TICKS) {
      lastMoveTick = snapshot.tick;
      say({ move: { target: theirs.position.z }, type: "duel.move", v: 1 });
    }

    if (
      mine.cooldown === 0 &&
      snapshot.tick - lastFireTick >= FIRE_EVERY_TICKS
    ) {
      lastFireTick = snapshot.tick;
      // Every other shot is straight, so its pattern can be read and dodged.
      const straight = Math.floor(snapshot.tick / FIRE_EVERY_TICKS) % 2 === 0;
      const lead = Math.atan2(
        theirs.position.z - mine.position.z,
        2 * PLAYER_X
      );
      say({
        fire: { angle: straight ? 0 : clamp(lead, MAX_FIRE_ANGLE) },
        type: "duel.fire",
        v: 1,
      });
    }
  };

  socket.addEventListener("open", () => {
    say({ roomId, type: "room.join", v: 1 });
  });

  socket.addEventListener("message", (event) => {
    const decoded = decodeServerMessage(String(event.data));
    if (Result.isFailure(decoded)) {
      return;
    }
    const message = decoded.success;
    if (message.type === "room.joined") {
      me = message.clientId;
    } else if (message.type === "duel.snapshot") {
      play(message);
    }
  });

  return {
    stop: () => {
      if (socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "bot dismissed");
      }
    },
  };
};
