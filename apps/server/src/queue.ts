/**
 * Who is waiting to play anyone, in the order they arrived.
 *
 * Pairing is first come, first served, and happens the moment a second
 * person arrives; nobody is held for a better match because there is no
 * such thing here. The queue knows how long each entry has waited so the
 * server can say so once a second, and the client can offer the bot once
 * the wait has gone on long enough.
 */

export interface Waiter<Entry> {
  readonly entry: Entry;
  readonly seconds: number;
}

export interface Queue<Entry> {
  /** Joins the queue, or leaves it with the pair it completed. */
  readonly enqueue: (entry: Entry) => readonly [Entry, Entry] | null;
  readonly dequeue: (entry: Entry) => void;
  readonly waiting: () => readonly Waiter<Entry>[];
  readonly size: () => number;
}

export const createQueue = <Entry>(
  now: () => number = Date.now
): Queue<Entry> => {
  const since = new Map<Entry, number>();

  return {
    enqueue: (entry) => {
      if (since.has(entry)) {
        return null;
      }
      const first = since.keys().next();
      if (first.done !== true) {
        since.delete(first.value);
        return [first.value, entry];
      }
      since.set(entry, now());
      return null;
    },
    dequeue: (entry) => {
      since.delete(entry);
    },
    waiting: () => {
      const at = now();
      return [...since].map(([entry, enteredAt]) => ({
        entry,
        seconds: Math.floor((at - enteredAt) / 1000),
      }));
    },
    size: () => since.size,
  };
};
