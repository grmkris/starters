import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { Mesh } from "three";

import type { WorldSource } from "./world-source";

/**
 * The render-side feel constants.
 *
 * Only values the renderer owns appear here. `MAX_SPEED` and the tick rate are
 * server-authoritative, so a browser knob for them would desync the client from
 * the world rather than tune it - the boundary is the point, not a limitation.
 */
export interface WorldFeel {
  /** Exponential follow stiffness; higher snaps harder to the last snapshot. */
  readonly followStiffness: number;
  /** Yaw rate of the local player's cube, in radians per second. */
  readonly localSpin: number;
  /** Yaw rate of every other cube, in radians per second. */
  readonly remoteSpin: number;
}

export const defaultWorldFeel: WorldFeel = {
  followStiffness: 12,
  localSpin: 0.7,
  remoteSpin: -0.4,
};

export interface WorldPalette {
  readonly background: string;
  readonly grid: string;
  readonly gridMajor: string;
  readonly keyLight: string;
  readonly local: string;
  readonly localEmissive: string;
  readonly remote: string;
  readonly remoteEmissive: string;
}

interface PlayerMeshProps {
  readonly clientId: string;
  readonly feel: WorldFeel;
  readonly isLocal: boolean;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

const PlayerMesh = ({
  clientId,
  feel,
  isLocal,
  palette,
  source,
}: PlayerMeshProps) => {
  const mesh = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    const target = source.getPosition(clientId);
    if (!(mesh.current && target)) {
      return;
    }

    const blend = 1 - Math.exp(-feel.followStiffness * delta);
    mesh.current.position.x += (target.x - mesh.current.position.x) * blend;
    mesh.current.position.y += (target.y - mesh.current.position.y) * blend;
    mesh.current.position.z += (target.z - mesh.current.position.z) * blend;
    mesh.current.rotation.y +=
      delta * (isLocal ? feel.localSpin : feel.remoteSpin);
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial
        color={isLocal ? palette.local : palette.remote}
        emissive={isLocal ? palette.localEmissive : palette.remoteEmissive}
        emissiveIntensity={0.45}
        metalness={0.35}
        roughness={0.28}
      />
    </mesh>
  );
};

interface SceneProps {
  readonly feel: WorldFeel;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

const Scene = ({ feel, localClientId, palette, source }: SceneProps) => {
  // Bound once per source. `useSyncExternalStore` resubscribes whenever the
  // subscribe function's identity changes, and `bind` returns a new function
  // on every call, so binding inline resubscribed on every render.
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
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 8, 24]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        color={palette.keyLight}
        intensity={2.2}
        position={[5, 9, 3]}
      />
      <pointLight
        color={palette.remote}
        intensity={16}
        position={[-6, 2, -4]}
      />
      {roster.map((clientId) => (
        <PlayerMesh
          key={clientId}
          clientId={clientId}
          feel={feel}
          isLocal={clientId === localClientId}
          palette={palette}
          source={source}
        />
      ))}
      <Grid
        cellColor={palette.grid}
        cellSize={0.5}
        fadeDistance={20}
        infiniteGrid
        sectionColor={palette.gridMajor}
        sectionSize={2}
      />
      <OrbitControls
        enablePan={false}
        maxDistance={15}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
      />
    </>
  );
};

interface WorldCanvasProps {
  readonly className?: string;
  readonly feel?: WorldFeel;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

export const WorldCanvas = ({
  className,
  feel = defaultWorldFeel,
  localClientId,
  palette,
  source,
}: WorldCanvasProps) => (
  <div className={className} data-slot="world-canvas">
    <Canvas
      camera={{ fov: 42, position: [6, 5, 8] }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      shadows
    >
      <Scene
        feel={feel}
        localClientId={localClientId}
        palette={palette}
        source={source}
      />
    </Canvas>
  </div>
);
