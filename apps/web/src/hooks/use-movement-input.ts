import type { MovementInput } from "@agent-native/domain";
import { useEffect, useRef } from "react";

import { realtimeStore } from "../lib/realtime-store";
import type { ConnectionStatus } from "../lib/realtime-store";

const MOVEMENT_KEYS = new Set(["a", "d", "s", "w"]);

const vectorOf = (pressed: ReadonlySet<string>): MovementInput => ({
  x: Number(pressed.has("d")) - Number(pressed.has("a")),
  z: Number(pressed.has("s")) - Number(pressed.has("w")),
});

export const useMovementInput = (status: ConnectionStatus): void => {
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    const keys = pressed.current;

    const onKeyChange = (event: KeyboardEvent, held: boolean): void => {
      const key = event.key.toLowerCase();
      if (!MOVEMENT_KEYS.has(key)) {
        return;
      }
      if (held) {
        keys.add(key);
      } else {
        keys.delete(key);
      }
      realtimeStore.sendInput(vectorOf(keys));
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      onKeyChange(event, true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      onKeyChange(event, false);
    };
    // A backgrounded tab never receives keyup, so a held key would otherwise
    // run the avatar off the map until the socket drops.
    const release = (): void => {
      keys.clear();
      realtimeStore.sendInput(vectorOf(keys));
    };
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        release();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, []);

  useEffect(() => {
    // Input is sent on change, and a fresh socket starts with none, so whatever
    // is held has to be re-announced when the connection comes back.
    if (status === "live") {
      realtimeStore.sendInput(vectorOf(pressed.current));
    }
  }, [status]);
};
