import type { WorldFeel } from "@agent-native/game-three";
import { defaultWorldFeel } from "@agent-native/game-three";
import { DialRoot, useDialKit } from "dialkit";
import { useEffect } from "react";

interface DevDialsProps {
  readonly onChange: (feel: WorldFeel) => void;
}

/**
 * Development-only knobs for the render-side feel constants.
 *
 * Loaded behind `import.meta.env.DEV`, so the production build drops this
 * module and both of its dependencies. Only values the renderer owns are here:
 * a browser knob for the simulation's speed or tick rate would desync the
 * client from the server rather than tune anything, and that boundary is worth
 * seeing rather than explaining.
 */
export const DevDials = ({ onChange }: DevDialsProps) => {
  const values = useDialKit("world feel", {
    followStiffness: [defaultWorldFeel.followStiffness, 1, 40, 0.5],
    localSpin: [defaultWorldFeel.localSpin, -3, 3, 0.05],
    remoteSpin: [defaultWorldFeel.remoteSpin, -3, 3, 0.05],
  });

  const { followStiffness, localSpin, remoteSpin } = values;

  useEffect(() => {
    onChange({ followStiffness, localSpin, remoteSpin });
  }, [followStiffness, localSpin, remoteSpin, onChange]);

  return <DialRoot position="bottom-right" theme="dark" />;
};
