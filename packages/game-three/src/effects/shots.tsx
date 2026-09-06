import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, Object3D } from "three";
import type { InstancedMesh } from "three";

import type { DuelSource } from "../duel-source";
import {
  STREAK_LENGTH,
  STREAK_THICKNESS,
  StreakGeometry,
  StreakMaterial,
} from "../models/streak";
import type { WorldPalette } from "../world-canvas";

/**
 * Every shot in flight and the afterimages behind it, as two instanced meshes
 * written per frame. Shots are born and die at 20 Hz and React must not learn
 * of each, so the count, matrices and colours are set directly. The trail
 * reads the same eased positions the streak uses, so it always sits behind
 * the shot it belongs to.
 */

const MAX_SHOTS = 16;
/** Afterimages per shot, one frame apart. */
const TRAIL = 6;
const STIFFNESS = 30;

interface Track {
  x: number;
  z: number;
  /** Ring buffer of past positions, most recent first. */
  readonly history: { x: number; z: number }[];
}

interface ShotsProps {
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

export const Shots = ({ localClientId, palette, source }: ShotsProps) => {
  const streaks = useRef<InstancedMesh>(null);
  const trails = useRef<InstancedMesh>(null);
  const tracks = useRef(new Map<number, Track>());
  const scratch = useMemo(() => new Object3D(), []);
  const colours = useMemo(
    () => ({
      local: new Color(palette.local),
      remote: new Color(palette.remote),
    }),
    [palette.local, palette.remote]
  );

  useFrame((_state, delta) => {
    const streakMesh = streaks.current;
    const trailMesh = trails.current;
    if (!(streakMesh && trailMesh)) {
      return;
    }
    const shots = source.getProjectiles();
    const blend = 1 - Math.exp(-STIFFNESS * delta);
    const alive = new Set<number>();
    let streakIndex = 0;
    let trailIndex = 0;

    for (const shot of shots) {
      if (streakIndex >= MAX_SHOTS) {
        break;
      }
      alive.add(shot.id);
      let track = tracks.current.get(shot.id);
      if (track === undefined) {
        track = { history: [], x: shot.position.x, z: shot.position.z };
        tracks.current.set(shot.id, track);
      } else {
        track.history.unshift({ x: track.x, z: track.z });
        if (track.history.length > TRAIL) {
          track.history.length = TRAIL;
        }
        track.x += (shot.position.x - track.x) * blend;
        track.z += (shot.position.z - track.z) * blend;
      }
      const colour =
        shot.ownerId === localClientId ? colours.local : colours.remote;
      const heading = Math.atan2(-shot.velocity.z, shot.velocity.x);

      scratch.position.set(track.x, shot.position.y, track.z);
      scratch.rotation.set(0, heading, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      streakMesh.setMatrixAt(streakIndex, scratch.matrix);
      streakMesh.setColorAt(streakIndex, colour);
      streakIndex += 1;

      for (const [age, past] of track.history.entries()) {
        const fade = 1 - (age + 1) / (TRAIL + 1);
        scratch.position.set(past.x, shot.position.y, past.z);
        scratch.rotation.set(0, heading, 0);
        scratch.scale.set(0.8, fade, fade);
        scratch.updateMatrix();
        trailMesh.setMatrixAt(trailIndex, scratch.matrix);
        trailMesh.setColorAt(trailIndex, colour);
        trailIndex += 1;
      }
    }

    for (const id of tracks.current.keys()) {
      if (!alive.has(id)) {
        tracks.current.delete(id);
      }
    }

    streakMesh.count = streakIndex;
    streakMesh.instanceMatrix.needsUpdate = true;
    if (streakMesh.instanceColor) {
      streakMesh.instanceColor.needsUpdate = true;
    }
    trailMesh.count = trailIndex;
    trailMesh.instanceMatrix.needsUpdate = true;
    if (trailMesh.instanceColor) {
      trailMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        args={[undefined, undefined, MAX_SHOTS]}
        frustumCulled={false}
        ref={streaks}
      >
        <StreakGeometry />
        <StreakMaterial />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, MAX_SHOTS * TRAIL]}
        frustumCulled={false}
        ref={trails}
      >
        <boxGeometry
          args={[STREAK_LENGTH, STREAK_THICKNESS, STREAK_THICKNESS]}
        />
        <meshBasicMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          opacity={0.45}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
    </>
  );
};
