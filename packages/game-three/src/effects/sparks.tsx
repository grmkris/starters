import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, Object3D } from "three";
import type { InstancedMesh } from "three";

import type { DuelEvent, DuelSource } from "../duel-source";
import type { WorldPalette } from "../world-canvas";

/**
 * One pool of sparks for every burst: a hit throws a fan of them in the
 * shooter's colour, a bank throws a few off the wall. Spawned from events,
 * aged in the frame loop, and drawn as one instanced mesh. The directions
 * are a fixed fan rather than random, which looks the same and needs no
 * generator.
 */

const POOL = 64;
const HIT_SPARKS = 18;
const BOUNCE_SPARKS = 6;
const HIT_TTL = 0.45;
const BOUNCE_TTL = 0.25;
const GRAVITY = 0;

interface Spark {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  ttl: number;
  colour: Color;
}

interface SparksProps {
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

export const Sparks = ({ localClientId, palette, source }: SparksProps) => {
  const mesh = useRef<InstancedMesh>(null);
  const pool = useRef<Spark[]>([]);
  const scratch = useMemo(() => new Object3D(), []);
  const colours = useMemo(
    () => ({
      local: new Color(palette.local),
      remote: new Color(palette.remote),
      wall: new Color(palette.gridMajor),
    }),
    [palette.gridMajor, palette.local, palette.remote]
  );

  useEffect(() => {
    const burst = (
      at: { readonly x: number; readonly z: number },
      count: number,
      speed: number,
      ttl: number,
      colour: Color
    ): void => {
      for (let index = 0; index < count; index += 1) {
        if (pool.current.length >= POOL) {
          pool.current.shift();
        }
        const angle = (index / count) * Math.PI * 2 + 0.3;
        const pace = speed * (0.6 + (0.4 * ((index * 7) % 5)) / 4);
        pool.current.push({
          colour,
          life: 0,
          ttl,
          vx: Math.cos(angle) * pace,
          vz: Math.sin(angle) * pace,
          x: at.x,
          z: at.z,
        });
      }
    };
    const onEvent = (event: DuelEvent): void => {
      if (event.kind === "hit") {
        burst(
          event.at,
          HIT_SPARKS,
          5,
          HIT_TTL,
          event.by === localClientId ? colours.local : colours.remote
        );
      } else if (event.kind === "bounce") {
        burst(event.at, BOUNCE_SPARKS, 3, BOUNCE_TTL, colours.wall);
      }
    };
    return source.subscribeEvents(onEvent);
  }, [colours, localClientId, source]);

  useFrame((_state, delta) => {
    const instanced = mesh.current;
    if (!instanced) {
      return;
    }
    let index = 0;
    pool.current = pool.current.filter((spark) => {
      spark.life += delta;
      if (spark.life >= spark.ttl) {
        return false;
      }
      spark.x += spark.vx * delta;
      spark.z += spark.vz * delta;
      spark.vz += GRAVITY * delta;
      const remaining = 1 - spark.life / spark.ttl;
      scratch.position.set(spark.x, 0.5, spark.z);
      scratch.rotation.set(0, Math.atan2(-spark.vz, spark.vx), 0);
      scratch.scale.set(0.6 + remaining, remaining, remaining);
      scratch.updateMatrix();
      instanced.setMatrixAt(index, scratch.matrix);
      instanced.setColorAt(index, spark.colour);
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
      <boxGeometry args={[0.16, 0.05, 0.05]} />
      <meshBasicMaterial
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        transparent
      />
    </instancedMesh>
  );
};
