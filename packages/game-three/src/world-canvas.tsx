import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";
import type { Mesh } from "three";

import type { WorldSource } from "./world-source";

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
  readonly isLocal: boolean;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

const PlayerMesh = ({
  clientId,
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

    const blend = 1 - Math.exp(-12 * delta);
    mesh.current.position.x += (target.x - mesh.current.position.x) * blend;
    mesh.current.position.y += (target.y - mesh.current.position.y) * blend;
    mesh.current.position.z += (target.z - mesh.current.position.z) * blend;
    mesh.current.rotation.y += delta * (isLocal ? 0.7 : -0.4);
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
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

const Scene = ({ localClientId, palette, source }: SceneProps) => {
  const roster = useSyncExternalStore(
    source.subscribeRoster.bind(source),
    source.getRosterSnapshot.bind(source),
    source.getRosterSnapshot.bind(source)
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
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly source: WorldSource;
}

export const WorldCanvas = ({
  className,
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
      <Scene localClientId={localClientId} palette={palette} source={source} />
    </Canvas>
  </div>
);
