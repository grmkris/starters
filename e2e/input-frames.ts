import type { Page } from "@playwright/test";
import { Result, Schema } from "effect";

/**
 * The frame shape these tests care about, decoded rather than type-guarded, so
 * a malformed frame fails the parse instead of being narrowed into shape.
 */
const InputFrame = Schema.Struct({
  input: Schema.Struct({ x: Schema.Finite, z: Schema.Finite }),
  type: Schema.Literals(["player.input"]),
});

const decodeInputFrame = Schema.decodeUnknownResult(
  Schema.fromJsonString(InputFrame)
);

export interface InputVector {
  readonly x: number;
  readonly z: number;
}

/**
 * Collects every movement vector the page puts on its socket. Asserting on
 * sent frames rather than on the DOM: the avatar's position never reaches the
 * document, and the claim under test is that a control reaches `sendInput`.
 * Register before `goto`, or the socket opens unobserved.
 */
export const recordInputs = (page: Page): InputVector[] => {
  const inputs: InputVector[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      const decoded = decodeInputFrame(String(frame.payload));
      if (Result.isSuccess(decoded)) {
        inputs.push(decoded.success.input);
      }
    });
  });
  return inputs;
};

const DuelFrame = Schema.Struct({
  phase: Schema.String,
  projectiles: Schema.Array(
    Schema.Struct({ position: Schema.Struct({ x: Schema.Finite }) })
  ),
  type: Schema.Literals(["duel.snapshot"]),
});

const decodeDuelFrame = Schema.decodeUnknownResult(
  Schema.fromJsonString(DuelFrame)
);

export type DuelFrame = typeof DuelFrame.Type;

/** Collects every duel snapshot the page receives. Register before `goto`. */
export const recordDuelSnapshots = (page: Page): DuelFrame[] => {
  const frames: DuelFrame[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => {
      const decoded = decodeDuelFrame(String(frame.payload));
      if (Result.isSuccess(decoded)) {
        frames.push(decoded.success);
      }
    });
  });
  return frames;
};

const IntentFrame = Schema.Struct({
  type: Schema.Literals(["duel.move", "duel.fire"]),
});

const decodeIntentFrame = Schema.decodeUnknownResult(
  Schema.fromJsonString(IntentFrame)
);

/** Collects the duel intent the page sends, in order. Register before `goto`. */
export const recordDuelIntent = (page: Page): ("duel.move" | "duel.fire")[] => {
  const sent: ("duel.move" | "duel.fire")[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      const decoded = decodeIntentFrame(String(frame.payload));
      if (Result.isSuccess(decoded)) {
        sent.push(decoded.success.type);
      }
    });
  });
  return sent;
};
