import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, Object3D } from "three";
import type { InstancedMesh } from "three";

import type { DuelSource } from "../duel-source";
import type { WorldPalette } from "../world-canvas";

/** A flash where a shot was born, gone in a tenth of a second. A pool of four is plenty. */

const POOL = 4;
const TTL = 0.09;

interface Flash {
  x: number;
  z: number;
  life: number;
  colour: Color;
}

interface MuzzleProps {
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

export const Muzzle = ({ localClientId, palette, source }: MuzzleProps) => {
  const mesh = useRef<InstancedMesh>(null);
  const flashes = useRef<Flash[]>([]);
  const scratch = useMemo(() => new Object3D(), []);
  const colours = useMemo(
    () => ({
      local: new Color(palette.local),
      remote: new Color(palette.remote),
    }),
    [palette.local, palette.remote]
  );

  useEffect(
    () =>
      source.subscribeEvents((event) => {
        if (event.kind !== "fire") {
          return;
        }
        if (flashes.current.length >= POOL) {
          flashes.current.shift();
        }
        flashes.current.push({
          colour:
            event.ownerId === localClientId ? colours.local : colours.remote,
          life: 0,
          x: event.at.x,
          z: event.at.z,
        });
      }),
    [colours, localClientId, source]
  );

  useFrame((_state, delta) => {
    const instanced = mesh.current;
    if (!instanced) {
      return;
    }
    let index = 0;
    flashes.current = flashes.current.filter((flash) => {
      flash.life += delta;
      if (flash.life >= TTL) {
        return false;
      }
      const size = 1 - flash.life / TTL;
      scratch.position.set(flash.x, 0.5, flash.z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(size, size, size);
      scratch.updateMatrix();
      instanced.setMatrixAt(index, scratch.matrix);
      instanced.setColorAt(index, flash.colour);
      index += 1;
      return true;
    });
    instanced.count = index;
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      args={[undefined, undefined, POOL]}
      frustumCulled={false}
      ref={mesh}
    >
      <octahedronGeometry args={[0.32, 0]} />
      <meshBasicMaterial
        blending={AdditiveBlending}
        depthWrite={false}
        opacity={0.9}
        toneMapped={false}
        transparent
      />
    </instancedMesh>
  );
};
