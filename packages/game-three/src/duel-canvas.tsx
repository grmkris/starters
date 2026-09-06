import { Grid, OrthographicCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { Mesh } from "three";

import type { DuelSource } from "./duel-source";
import { Muzzle } from "./effects/muzzle";
import { Seam } from "./effects/seam";
import { Shots } from "./effects/shots";
import { Sparks } from "./effects/sparks";
import { fitLane } from "./lane-fit";
import type { ModelState } from "./model-slot";
import { Tank } from "./models/tank";
import { ObliqueGroup } from "./oblique-group";
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

/**
 * How the phone is held. Portrait puts two phones side by side and the seam
 * on the long edge between them, screen-up being -z. Landscape stacks them,
 * one above the other, the seam still on the long edge between them, and
 * screen-up becomes -x: for side -1 the seam is at the bottom of its screen,
 * for side 1 at the top. Both keep screen-right the same world direction on
 * both phones, so a shot keeps its heading as it crosses.
 */
export type DuelLayout = "portrait" | "landscape";

/** URLs of glTF files to stand in for the procedural models, per slot. */
export interface DuelModels {
  readonly player?: string | undefined;
}

const FOLLOW_STIFFNESS = 18;

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

interface LaneProps {
  readonly field: DuelField;
  readonly layout: DuelLayout;
  readonly models?: DuelModels | undefined;
  readonly onModelState?: ((state: ModelState) => void) | undefined;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly side: -1 | 1;
  readonly source: DuelSource;
}

const Lane = ({
  field,
  layout,
  localClientId,
  models,
  onModelState,
  palette,
  side,
  source,
}: LaneProps) => {
  const { height, width } = useThree((state) => state.size);
  const laneWidth = field.halfWidth;
  const laneHeight = field.laneHalfHeight * 2;
  const centreX = (side * laneWidth) / 2;
  // The lane runs down the screen in portrait and across it in landscape;
  // `lane-fit` says how it sits on the screen and where the camera looks.
  const { cameraX, zoom } = fitLane(
    layout === "portrait"
      ? { across: width, along: height }
      : { across: height, along: width },
    { length: laneHeight, width: laneWidth },
    side
  );

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
        key={layout}
        makeDefault
        onUpdate={(camera) => {
          camera.lookAt(cameraX, 0, 0);
          camera.updateProjectionMatrix();
        }}
        position={[cameraX, 20, 0]}
        up={layout === "portrait" ? [0, 0, -1] : [-1, 0, 0]}
        zoom={zoom}
      />
      <color attach="background" args={[palette.background]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        color={palette.keyLight}
        intensity={2}
        position={[centreX - side * 3, 8, -3]}
      />
      <ObliqueGroup axis={layout === "portrait" ? "z" : "x"}>
        <Grid
          args={[laneWidth, laneHeight]}
          cellColor={palette.grid}
          cellSize={0.5}
          position={[centreX, 0, 0]}
          sectionColor={palette.gridMajor}
          sectionSize={2}
        />
        <Seam laneHeight={laneHeight} palette={palette} source={source} />
        {/* The lane walls a shot banks off. */}
        <mesh position={[centreX, 0.02, -field.laneHalfHeight]}>
          <boxGeometry args={[laneWidth, 0.02, 0.06]} />
          <meshBasicMaterial color={palette.gridMajor} />
        </mesh>
        <mesh position={[centreX, 0.02, field.laneHalfHeight]}>
          <boxGeometry args={[laneWidth, 0.02, 0.06]} />
          <meshBasicMaterial color={palette.gridMajor} />
        </mesh>
        {roster.map((clientId) => {
          const duelist = source.getDuelist(clientId);
          if (duelist === undefined) {
            return null;
          }
          const isLocal = clientId === localClientId;
          return (
            <group key={clientId}>
              <Tank
                clientId={clientId}
                isLocal={isLocal}
                model={models?.player}
                onModelState={isLocal ? onModelState : undefined}
                palette={palette}
                side={duelist.side}
                source={source}
              />
              {isLocal ? null : (
                <SeamMarker
                  clientId={clientId}
                  palette={palette}
                  source={source}
                />
              )}
            </group>
          );
        })}
        <Shots
          localClientId={localClientId}
          palette={palette}
          source={source}
        />
        <Sparks
          localClientId={localClientId}
          palette={palette}
          source={source}
        />
        <Muzzle
          localClientId={localClientId}
          palette={palette}
          source={source}
        />
      </ObliqueGroup>
    </>
  );
};

interface DuelCanvasProps {
  readonly className?: string;
  readonly field: DuelField;
  readonly layout: DuelLayout;
  readonly models?: DuelModels | undefined;
  readonly onModelState?: ((state: ModelState) => void) | undefined;
  readonly localClientId: string | null;
  readonly palette: WorldPalette;
  readonly side: -1 | 1;
  readonly source: DuelSource;
}

export const DuelCanvas = ({
  className,
  field,
  layout,
  localClientId,
  models,
  onModelState,
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
        layout={layout}
        localClientId={localClientId}
        models={models}
        onModelState={onModelState}
        palette={palette}
        side={side}
        source={source}
      />
    </Canvas>
  </div>
);
