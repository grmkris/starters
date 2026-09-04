/**
 * Fixed-timestep pacing for the authoritative loop.
 *
 * A bare `setInterval` at the tick period silently loses time: the OS fires
 * late under load, the callback steps once regardless of how late it was, and
 * the simulation falls behind wall clock with nothing in the system able to
 * notice. Carrying the remainder in an accumulator makes a late firing run the
 * ticks it owes rather than dropping them.
 */

/**
 * Longest stretch of real time a single firing may account for, in ticks.
 *
 * A process can return from a suspend - laptop lid, debugger breakpoint, a long
 * GC pause - with minutes of elapsed time. Without a ceiling the loop would try
 * to run every tick in that gap at once, blocking the thread long enough to be
 * starved again. Time past the ceiling is discarded, so the simulation runs slow
 * rather than freezing; once real time has genuinely been lost those are the
 * only two outcomes available.
 */
const MAX_CATCH_UP_TICKS = 5;

export interface TickPacer {
  /**
   * Consumes `elapsedMs` of real time and returns the number of whole ticks now
   * owed. The caller must pass a delta from a monotonic clock.
   */
  readonly advance: (elapsedMs: number) => number;
}

export const createTickPacer = (
  tickMs: number,
  maxCatchUpTicks: number = MAX_CATCH_UP_TICKS
): TickPacer => {
  const ceiling = tickMs * maxCatchUpTicks;
  let accumulator = 0;

  return {
    advance: (elapsedMs) => {
      accumulator += Math.min(Math.max(elapsedMs, 0), ceiling);

      let owed = 0;
      while (accumulator >= tickMs) {
        accumulator -= tickMs;
        owed += 1;
      }

      return owed;
    },
  };
};
