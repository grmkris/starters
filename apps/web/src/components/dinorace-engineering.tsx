import type { DinoRaceManifest } from "@agent-native/domain";
import type { DinoRaceDebug, DinoRaceMetrics } from "@agent-native/game-three";
import { Button } from "@agent-native/ui/components/button";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

const debugControls: readonly (readonly [keyof DinoRaceDebug, string])[] = [
  ["wireframe", "Wireframe"],
  ["bounds", "Bounding boxes"],
  ["rig", "Fit anchors / unrigged"],
  ["colliders", "Collision proxies"],
  ["racingLine", "Racing spline"],
  ["cameraLine", "Camera path"],
  ["labels", "Object labels"],
  ["normals", "Skull normals"],
  ["lights", "Light helpers"],
];

interface EngineeringProps {
  readonly manifest: DinoRaceManifest;
  readonly metrics: DinoRaceMetrics;
  readonly debug: DinoRaceDebug;
  readonly nodes: readonly string[];
  readonly setDebug: Dispatch<SetStateAction<DinoRaceDebug>>;
  readonly onClose: () => void;
}
export const DinoRaceEngineering = ({
  manifest,
  metrics,
  debug,
  nodes,
  setDebug,
  onClose,
}: EngineeringProps) => {
  const [graph, setGraph] = useState(false);
  const [performanceVisible, setPerformanceVisible] = useState(true);
  return (
    <aside className="dino-engineering" aria-label="Engineering">
      <div className="dino-panel-title">
        <span>ENGINEERING VIEW</span>
        <Button
          size="xs"
          variant="ghost"
          onClick={onClose}
          aria-label="Close engineering"
        >
          ×
        </Button>
      </div>
      <p>Blender {manifest.blenderVersion} / GLTF 2.0</p>
      <div className="dino-debug-controls">
        {debugControls.map(([key, label]) => (
          <Button
            key={key}
            size="xs"
            variant="ghost"
            aria-pressed={debug[key]}
            onClick={() => {
              setDebug((value) => ({ ...value, [key]: !value[key] }));
            }}
          >
            {debug[key] ? "−" : "+"} {label}
          </Button>
        ))}
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={graph}
          onClick={() => {
            setGraph((value) => !value);
          }}
        >
          Scene graph
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={performanceVisible}
          onClick={() => {
            setPerformanceVisible((value) => !value);
          }}
        >
          Performance stats
        </Button>
      </div>
      {performanceVisible && (
        <dl className="dino-debug-stats">
          <div>
            <dt>FRAME RATE</dt>
            <dd>{metrics.fps} FPS</dd>
          </div>
          <div>
            <dt>DRAW CALLS</dt>
            <dd>{metrics.drawCalls}</dd>
          </div>
          <div>
            <dt>VISIBLE TRIANGLES</dt>
            <dd>{metrics.triangles.toLocaleString()}</dd>
          </div>
          <div>
            <dt>GLB / LOAD</dt>
            <dd>
              {(manifest.bytes / 1_048_576).toFixed(2)} MB /{" "}
              {Math.round(metrics.loadMs)} MS
            </dd>
          </div>
          <div>
            <dt>ASSET TRIANGLES</dt>
            <dd>{manifest.triangles.toLocaleString()}</dd>
          </div>
          <div>
            <dt>MAT / TEX / ANIM</dt>
            <dd>
              {manifest.materials} / {manifest.textures} / {manifest.animations}
            </dd>
          </div>
          <div>
            <dt>GENERATION</dt>
            <dd>{manifest.durationSeconds.toFixed(1)} S</dd>
          </div>
          <div>
            <dt>HEAD CLEARANCE</dt>
            <dd>+{manifest.fit.headClearance} M</dd>
          </div>
          <div>
            <dt>COCKPIT MARGIN</dt>
            <dd>{manifest.fit.cockpitWidthDelta} M</dd>
          </div>
          <div>
            <dt>TAIL / AABB HITS</dt>
            <dd>{manifest.fit.tailIntersections}</dd>
          </div>
        </dl>
      )}
      {debug.labels && (
        <p className="dino-node-labels">
          {manifest.objects.driver}
          <br />
          {manifest.objects.car}
          <br />4 WHEEL PIVOTS · Y-UP / METRES
        </p>
      )}
      {graph && <pre className="dino-scene-graph">{nodes.join("\n")}</pre>}
      <p className="dino-job-id">JOB {manifest.jobId}</p>
      <a href="/dinorace-assets/preview.png" target="_blank" rel="noreferrer">
        Open Blender preview ↗
      </a>
    </aside>
  );
};
