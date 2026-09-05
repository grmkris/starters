import { Grid, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { Color, Object3D } from "three";
import type { InstancedMesh, Mesh } from "three";

import type { DuelSource } from "./duel-source";
import type { WorldPalette } from "./world-canvas";

/**
 * One phone's half of the field.
 *
 * The camera looks straight down, orthographic, with the lane's width fitted
 * to the canvas width. That is what puts the seam exactly on the screen edge:
 * a perspective tilt would project anything above the ground plane past the
 * lane's true edge, and two phones on a table would show a shot in both
 * places or neither for a frame. Depth comes from lighting and height instead.
 *
 * The camera's up is -z, so +z is down the screen on both phones and a shot
 * keeps its direction as it crosses. Screen-right is +x on both, which makes
 * side -1's right edge the seam and side 1's left edge the seam.
 */

export interface DuelField {
  readonly halfWidth: number;
  readonly laneHalfHeight: number;
}

const MAX_PROJECTILES = 16;
const FOLLOW_STIFFNESS = 18;
const PROJECTILE_STIFFNESS = 30;

interface Eased {
  x: number;
  z: number;
}

const ease = (current: Eased, target: Eased, blend: number): void => {
  current.x += (target.x - current.x) * blend;
  current.z += (target.z - current.z) * blend;
};

interface DuelistProps {
  readonly clientId: string;
  readonly isLocal: boolean;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

const Duelist = ({ clientId, isLocal, palette, source }: DuelistProps) => {
  const mesh = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    const target = source.getPosition(clientId);
    if (!(mesh.current && target)) {
      return;
    }
    const blend = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    mesh.current.position.x += (target.x - mesh.current.position.x) * blend;
    mesh.current.position.z += (target.z - mesh.current.position.z) * blend;
    mesh.current.position.y = target.y;
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[0.8, 0.6, 0.8]} />
      <meshStandardMaterial
        color={isLocal ? palette.local : palette.remote}
        emissive={isLocal ? palette.localEmissive : palette.remoteEmissive}
        emissiveIntensity={0.5}
        metalness={0.3}
        roughness={0.35}
      />
    </mesh>
  );
};

interface SeamMarkerProps {
  readonly clientId: string;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

/**
 * Where the opponent is along the seam, for a player who cannot see the other
 * phone. A thin bar on the seam edge that tracks their z.
 */
const SeamMarker = ({ clientId, palette, source }: SeamMarkerProps) => {
  const mesh = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    const target = source.getPosition(clientId);
    if (!(mesh.current && target)) {
      return;
    }
    const blend = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    mesh.current.position.z += (target.z - mesh.current.position.z) * blend;
  });

  return (
    <mesh position={[0, 0.05, 0]} ref={mesh}>
      <boxGeometry args={[0.1, 0.1, 1]} />
      <meshBasicMaterial color={palette.remote} />
    </mesh>
  );
};

interface ProjectilesProps {
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: DuelSource;
}

/**
 * Every shot in flight, as one instanced mesh updated per frame. Shots are
 * born and die at 20 Hz and React must not learn about each one, so the count
 * and matrices are written directly.
 */
const Projectiles = ({ localClientId, palette, source }: ProjectilesProps) => {
  const mesh = useRef<InstancedMesh>(null);
  const eased = useRef(new Map<number, Eased>());
  const scratch = useMemo(() => new Object3D(), []);
  const colours = useMemo(
    () => ({
      local: new Color(palette.local),
      remote: new Color(palette.remote),
    }),
    [palette.local, palette.remote]
  );

  useFrame((_state, delta) => {
    const instanced = mesh.current;
    if (!instanced) {
      return;
    }
    const shots = source.getProjectiles();
    const blend = 1 - Math.exp(-PROJECTILE_STIFFNESS * delta);
    const alive = new Set<number>();
    let index = 0;

    for (const shot of shots) {
      if (index >= MAX_PROJECTILES) {
        break;
      }
      alive.add(shot.id);
      let current = eased.current.get(shot.id);
      if (current === undefined) {
        current = { x: shot.position.x, z: shot.position.z };
        eased.current.set(shot.id, current);
      } else {
        ease(current, shot.position, blend);
      }
      scratch.position.set(current.x, shot.position.y, current.z);
      // The box is long along its own x; turn it to follow the velocity.
      scratch.rotation.set(0, Math.atan2(-shot.velocity.z, shot.velocity.x), 0);
      scratch.updateMatrix();
      instanced.setMatrixAt(index, scratch.matrix);
      instanced.setColorAt(
        index,
        shot.ownerId === localClientId ? colours.local : colours.remote
      );
      index += 1;
    }

    for (const id of eased.current.keys()) {
      if (!alive.has(id)) {
        eased.current.delete(id);
      }
    }

    instanced.count = index;
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      args={[undefined, undefined, MAX_PROJECTILES]}
      frustumCulled={false}
      ref={mesh}
    >
      <boxGeometry args={[0.5, 0.12, 0.12]} />
      <meshStandardMaterial
        emissive={palette.local}
        emissiveIntensity={0.8}
        toneMapped={false}
      />
    </instancedMesh>
  );
};

interface LaneProps {
  readonly field: DuelField;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly side: -1 | 1;
  readonly source: DuelSource;
}

const Lane = ({ field, localClientId, palette, side, source }: LaneProps) => {
  const { width } = useThree((state) => state.size);
  const laneWidth = field.halfWidth;
  const laneHeight = field.laneHalfHeight * 2;
  const centreX = (side * laneWidth) / 2;

  const accessors = useMemo(
    () => ({
      getRoster: source.getRosterSnapshot.bind(source),
      subscribe: source.subscribeRoster.bind(source),
    }),
    [source]
  );
  const roster = useSyncExternalStore(
    accessors.subscribe,
    accessors.getRoster,
    accessors.getRoster
  );

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[centreX, 20, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        up={[0, 0, -1]}
        zoom={width / laneWidth}
      />
      <color attach="background" args={[palette.background]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        color={palette.keyLight}
        intensity={2}
        position={[centreX - side * 3, 8, -3]}
      />
      <Grid
        args={[laneWidth, laneHeight]}
        cellColor={palette.grid}
        cellSize={0.5}
        position={[centreX, 0, 0]}
        sectionColor={palette.gridMajor}
        sectionSize={2}
      />
      {/* The seam: the edge of this screen and of the other. */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.06, 0.02, laneHeight]} />
        <meshBasicMaterial color={palette.local} />
      </mesh>
      {/* The lane walls a shot banks off. */}
      <mesh position={[centreX, 0.02, -field.laneHalfHeight]}>
        <boxGeometry args={[laneWidth, 0.02, 0.06]} />
        <meshBasicMaterial color={palette.gridMajor} />
      </mesh>
      <mesh position={[centreX, 0.02, field.laneHalfHeight]}>
        <boxGeometry args={[laneWidth, 0.02, 0.06]} />
        <meshBasicMaterial color={palette.gridMajor} />
      </mesh>
      {roster.map((clientId) =>
        clientId === localClientId ? (
          <Duelist
            clientId={clientId}
            isLocal
            key={clientId}
            palette={palette}
            source={source}
          />
        ) : (
          <group key={clientId}>
            <Duelist
              clientId={clientId}
              isLocal={false}
              palette={palette}
              source={source}
            />
            <SeamMarker clientId={clientId} palette={palette} source={source} />
          </group>
        )
      )}
      <Projectiles
        localClientId={localClientId}
        palette={palette}
        source={source}
      />
    </>
  );
};

interface DuelCanvasProps {
  readonly className?: string;
  readonly field: DuelField;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly side: -1 | 1;
  readonly source: DuelSource;
}

export const DuelCanvas = ({
  className,
  field,
  localClientId,
  palette,
  side,
  source,
}: DuelCanvasProps) => (
  <div className={className} data-slot="duel-canvas">
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <Lane
        field={field}
        localClientId={localClientId}
        palette={palette}
        side={side}
        source={source}
      />
    </Canvas>
  </div>
);
