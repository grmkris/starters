import type { MovementInput } from "@agent-native/domain";

interface CapturedInput<Id extends string> {
  readonly clientId: Id;
  readonly input: MovementInput;
}

export interface InputBuffer<Id extends string> {
  /** Records the latest intent from one client, replacing any earlier one. */
  readonly capture: (clientId: Id, input: MovementInput) => void;
  /** Returns the frame to apply at this tick boundary and empties the buffer. */
  readonly drain: () => readonly CapturedInput<Id>[];
}

/**
 * Collects client intent between ticks so the simulation consumes it at a
 * boundary rather than on arrival.
 *
 * Applying input the moment a socket message lands makes the sequence the
 * simulation actually sees a function of network jitter: the client sends every
 * 50ms and the server steps every 50ms on an independent timer, so whether a
 * given message falls before or after a given step is decided by arrival timing
 * that nothing records. Two messages inside one window meant the first was
 * silently overwritten and never observed at all.
 *
 * Draining at the boundary does not stop input being superseded - holding a key
 * still means the last value in the window wins, which is what a level-triggered
 * control should do. It makes the loss a property of the recorded frame instead
 * of an accident of scheduling, which is what lets the same frames reproduce the
 * same world.
 */
export const createInputBuffer = <Id extends string>(): InputBuffer<Id> => {
  const pending = new Map<Id, MovementInput>();

  return {
    capture: (clientId, input) => {
      pending.set(clientId, input);
    },

    drain: () => {
      // Sorted so a frame is a canonical record. Applying to one client cannot
      // affect another, so order never changes the world - but it does change
      // the bytes, and a ledger nobody can diff is worth less than one they can.
      const frame = [...pending]
        .map(([clientId, input]) => ({ clientId, input }))
        .toSorted((left, right) => (left.clientId < right.clientId ? -1 : 1));

      pending.clear();
      return frame;
    },
  };
};
