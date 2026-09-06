/**
 * Keeps the screen on for as long as the caller holds the lock. A phone that
 * dims mid-match drops its socket and voids the room; this is the cheapest
 * way not to. The lock is lost whenever the page leaves the foreground and
 * is asked for again when it returns. Browsers without it simply do not
 * grant one.
 */
export const keepAwake = (): (() => void) => {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  const request = async (): Promise<void> => {
    if (released || !("wakeLock" in navigator) || document.hidden) {
      return;
    }
    try {
      sentinel = await navigator.wakeLock.request("screen");
    } catch {
      // Refused, for instance on low battery. Nothing to do but play on.
    }
  };

  const onVisible = (): void => {
    if (!document.hidden) {
      void request();
    }
  };

  document.addEventListener("visibilitychange", onVisible);
  void request();

  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release();
    sentinel = null;
  };
};
