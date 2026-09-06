import {
  Environment,
  Helper,
  Lightformer,
  MeshReflectorMaterial,
  Sparkles,
} from "@react-three/drei";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  DirectionalLightHelper,
} from "three";

import type { DinoRacePalette, DinoRaceSource } from "./dinorace-source";

interface TrackProps {
  readonly source: DinoRaceSource;
  readonly low: boolean;
  readonly insane: boolean;
  readonly engineering: boolean;
  readonly showLights: boolean;
  readonly palette: DinoRacePalette;
}

const kerbGeometry = (
  source: DinoRaceSource,
  side: number,
  alternate: number
) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < source.track.length - 4; i += 4) {
    if ((i / 4) % 2 !== alternate) {
      continue;
    }
    const a = source.track[i];
    const b = source.track[i + 4];
    if (!(a && b)) {
      continue;
    }
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = (b.z - a.z) / length;
    const nz = -(b.x - a.x) / length;
    const offset = positions.length / 3;
    for (const [point, width] of [
      [a, 6],
      [a, 6.65],
      [b, 6.65],
      [b, 6],
    ] as const) {
      positions.push(
        point.x + nx * width * side,
        0.025,
        point.z + nz * width * side
      );
    }
    indices.push(
      offset,
      offset + 2,
      offset + 1,
      offset,
      offset + 3,
      offset + 2
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const Kerbs = ({
  source,
  color,
}: {
  readonly source: DinoRaceSource;
  readonly color: string;
}) => {
  const pieces = useMemo(
    () =>
      [-1, 1].flatMap((side) =>
        [0, 1].map((alternate) => ({
          key: `${side}-${alternate}`,
          geometry: kerbGeometry(source, side, alternate),
          color: alternate === 0 ? color : "#bac6c7",
        }))
      ),
    [source, color]
  );
  useEffect(
    () => () => {
      for (const piece of pieces) {
        piece.geometry.dispose();
      }
    },
    [pieces]
  );
  return pieces.map((piece) => (
    <mesh key={piece.key} geometry={piece.geometry}>
      <meshStandardMaterial
        color={piece.color}
        metalness={0.35}
        roughness={0.28}
      />
    </mesh>
  ));
};

export const DinoRaceTrack = ({
  source,
  low,
  insane,
  engineering,
  showLights,
  palette,
}: TrackProps) => (
  <>
    <color attach="background" args={[palette.void]} />
    <fogExp2 attach="fog" args={[palette.void, engineering ? 0.006 : 0.013]} />
    <hemisphereLight args={[palette.cool, "#242015", 1.15]} />
    <directionalLight
      position={[-10, 14, 7]}
      color={palette.cool}
      intensity={3.5}
      castShadow={!low}
      shadow-mapSize={[insane ? 2048 : 1024, insane ? 2048 : 1024]}
      shadow-camera-left={-12}
      shadow-camera-right={12}
      shadow-camera-top={12}
      shadow-camera-bottom={-12}
      shadow-bias={-0.001}
    >
      {showLights && (
        <Helper type={DirectionalLightHelper} args={[2, palette.cool]} />
      )}
    </directionalLight>
    <directionalLight
      position={[6, 7, -8]}
      color={palette.warm}
      intensity={2.5}
    />
    <Environment resolution={low ? 64 : 128} frames={1}>
      <Lightformer
        form="rect"
        intensity={4}
        position={[0, 8, 3]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[18, 6, 1]}
        color={palette.cool}
      />
      <Lightformer
        form="rect"
        intensity={3}
        position={[-9, 4, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[15, 4, 1]}
        color={palette.cool}
      />
      <Lightformer
        form="rect"
        intensity={5}
        position={[9, 4, -4]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[12, 2, 1]}
        color={palette.warm}
      />
    </Environment>
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[25, -0.035, 8]}
      receiveShadow
    >
      <planeGeometry args={[650, 650]} />
      {low || engineering ? (
        <meshStandardMaterial
          color="#18232b"
          roughness={0.38}
          metalness={0.5}
        />
      ) : (
        <MeshReflectorMaterial
          color="#19232b"
          resolution={insane ? 1024 : 512}
          mirror={0.35}
          mixStrength={1.2}
          metalness={0.6}
          roughness={0.34}
          depthScale={0.15}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
        />
      )}
    </mesh>
    <Kerbs source={source} color={palette.paint} />
    {Array.from({ length: 10 }, (_, i) => (
      <group key={i} position={[i % 2 === 0 ? -2.5 : 2.5, 0.006, -4 - i * 4]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.8, 0.12]} />
          <meshStandardMaterial color="#aabac1" />
        </mesh>
        <mesh position={[-1.34, 0, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 1.2]} />
          <meshStandardMaterial color="#aabac1" />
        </mesh>
        <mesh position={[1.34, 0, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 1.2]} />
          <meshStandardMaterial color="#aabac1" />
        </mesh>
      </group>
    ))}
    {Array.from({ length: 12 }, (_, i) => (
      <mesh
        key={i}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-5.5 + i, 0.012, 0]}
      >
        <planeGeometry args={[1, 0.7]} />
        <meshStandardMaterial color={i % 2 === 0 ? "#dce7e8" : "#162129"} />
      </mesh>
    ))}
    {[-1, 1].flatMap((side) =>
      Array.from({ length: 4 }, (_, i) => (
        <group key={`${side}-${i}`} position={[side * 8, 0, -20 + i * 14]}>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.7, 1.2, 13.6]} />
            <meshStandardMaterial
              color="#31424b"
              metalness={0.55}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, 1.27, 0]}>
            <boxGeometry args={[0.76, 0.05, 13.5]} />
            <meshStandardMaterial
              color={palette.cool}
              emissive={palette.cool}
              emissiveIntensity={1.6}
            />
          </mesh>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.07, 0.12, 10, 8]} />
            <meshStandardMaterial
              color="#26343f"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[-side * 0.7, 10, 0]} rotation={[0, 0, side * 0.25]}>
            <boxGeometry args={[2, 0.1, 1]} />
            <meshStandardMaterial
              emissive={palette.cool}
              emissiveIntensity={6}
              color={palette.cool}
            />
          </mesh>
        </group>
      ))
    )}
    {/* Raised above the chase camera so the gantry cannot fill the driving view. */}
    <group position={[0, 12, 8]}>
      <mesh>
        <boxGeometry args={[17, 0.65, 0.5]} />
        <meshStandardMaterial color="#151f26" metalness={0.8} roughness={0.3} />
      </mesh>
      {[-2, -1, 0, 1, 2].map((x) => (
        <mesh key={x} position={[x, 0.05, 0.3]}>
          <circleGeometry args={[0.16, 16]} />
          <meshStandardMaterial
            color={palette.paint}
            emissive={palette.paint}
            emissiveIntensity={3}
          />
        </mesh>
      ))}
    </group>
    <Sparkles
      count={low ? 24 : 100}
      scale={[55, 9, 100]}
      position={[10, 4, 0]}
      size={1.2}
      speed={0.14}
      opacity={0.24}
      color={palette.cool}
    />
    <group position={[-22, 2, -10]}>
      <mesh>
        <boxGeometry args={[16, 4, 65]} />
        <meshStandardMaterial color="#142029" roughness={0.75} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[8.03, 0.1, -28 + i * 7]}>
          <boxGeometry args={[0.06, 1.7, 4.5]} />
          <meshStandardMaterial
            color={palette.warm}
            emissive={palette.warm}
            emissiveIntensity={1.2}
          />
        </mesh>
      ))}
    </group>
  </>
);
