import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Mesh, MeshBasicMaterial } from "three";

import type { DuelSource } from "../duel-source";
import type { WorldPalette } from "../world-canvas";

/**
 * The seam: the edge of this screen and of the other. A thin line always,
 * and a wider glow that flares when a shot crosses it, on both phones at
 * once because both hear the same event.
 */

const PULSE_SECONDS = 0.35;

interface SeamProps {
  readonly laneHeight: number;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

export const Seam = ({ laneHeight, palette, source }: SeamProps) => {
  const glow = useRef<Mesh>(null);
  const glowMaterial = useRef<MeshBasicMaterial>(null);
  const pulse = useRef(0);

  useEffect(
    () =>
      source.subscribeEvents((event) => {
        if (event.kind === "cross") {
          pulse.current = 1;
        }
      }),
    [source]
  );

  useFrame((_state, delta) => {
    pulse.current = Math.max(0, pulse.current - delta / PULSE_SECONDS);
    if (glow.current) {
      glow.current.scale.x = 1 + 6 * pulse.current;
    }
    if (glowMaterial.current) {
      glowMaterial.current.opacity = 0.9 * pulse.current;
    }
  });

  return (
    <>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.06, 0.02, laneHeight]} />
        <meshBasicMaterial color={palette.local} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.01, 0]} ref={glow}>
        <boxGeometry args={[0.1, 0.01, laneHeight]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={palette.local}
          depthWrite={false}
          opacity={0}
          ref={glowMaterial}
          toneMapped={false}
          transparent
        />
      </mesh>
    </>
  );
};
