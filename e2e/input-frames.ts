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
