import type { MovementInput } from "@agent-native/domain";
import { useEffect, useRef } from "react";

import { realtimeStore } from "../lib/realtime-store";
import type { ConnectionStatus } from "../lib/realtime-store";

/**
 * Physical keys, not characters. `event.code` names the key under the finger
 * whatever the layout, so the WASD cluster works on AZERTY and Dvorak, where
 * `event.key` for the same keys is Z/Q/S/D and comma/A/O/E.
 */
const MOVEMENT_CODES = new Set(["KeyA", "KeyD", "KeyS", "KeyW"]);

const vectorOf = (pressed: ReadonlySet<string>): MovementInput => ({
  x: Number(pressed.has("KeyD")) - Number(pressed.has("KeyA")),
  z: Number(pressed.has("KeyS")) - Number(pressed.has("KeyW")),
});

export const useMovementInput = (status: ConnectionStatus): void => {
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    const keys = pressed.current;

    const onKeyChange = (event: KeyboardEvent, held: boolean): void => {
      const { code } = event;
      if (!MOVEMENT_CODES.has(code)) {
        return;
      }
      if (held) {
        keys.add(code);
      } else {
        keys.delete(code);
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
