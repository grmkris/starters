import { Schema } from "effect";

import { DinoRaceJobId } from "./id";

const dimension = (minimum: number, maximum: number) =>
  Schema.Finite.check(Schema.isBetween({ minimum, maximum }));

/** Metres; source names resolve through a trusted worker catalog, never user paths. */
export const DinoRaceAssetJob = Schema.Struct({
  version: Schema.Literal(1),
  seed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65_535 })),
  dinosaur: Schema.Struct({
    species: Schema.Literals(["trex", "raptor", "unicorn"]),
    source: Schema.Literals(["procedural", "studio-trex"]),
    scale: dimension(0.6, 1.5),
  }).check(
    Schema.makeFilter((driver) =>
      driver.species !== "unicorn" || driver.source === "procedural"
        ? undefined
        : "Unicorns use the procedural source"
    )
  ),
  vehicle: Schema.Struct({
    archetype: Schema.Literal("formula"),
    wheelbase: dimension(3.5, 5.5),
    trackWidth: dimension(3, 5),
    cockpitScale: dimension(0.8, 1.6),
  }),
  scene: Schema.Struct({
    environment: Schema.Literal("night-track"),
    quality: Schema.Literals(["draft", "production"]),
  }),
  output: Schema.Struct({ preview: Schema.Boolean }),
});
export type DinoRaceAssetJob = typeof DinoRaceAssetJob.Type;
export const defaultDinoRaceJob: DinoRaceAssetJob = {
  version: 1,
  seed: 19,
  dinosaur: { species: "unicorn", source: "procedural", scale: 1 },
  vehicle: {
    archetype: "formula",
    wheelbase: 4.4,
    trackWidth: 3.8,
    cockpitScale: 1,
  },
  scene: { environment: "night-track", quality: "production" },
  output: { preview: true },
};
const tuple = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);
const bounds = Schema.Struct({ min: tuple, max: tuple });
const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
/** All coordinates use glTF Y-up, metres, forward +Z. */
export const DinoRaceManifest = Schema.Struct({
  version: Schema.Literal(1),
  asset: Schema.Literal("scene.glb"),
  preview: Schema.NullOr(Schema.Literal("preview.png")),
  jobId: DinoRaceJobId,
  inputHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  blenderVersion: Schema.String,
  pipelineVersion: Schema.String,
  generatedAt: Schema.String,
  durationSeconds: Schema.Finite,
  bytes: count,
  triangles: count,
  materials: count,
  textures: count,
  animations: count,
  identity: Schema.Struct({
    species: Schema.Literals(["trex", "raptor", "unicorn"]),
    name: Schema.String,
    classification: Schema.String,
    massKg: Schema.Finite,
    horns: Schema.Array(Schema.String),
  }),
  objects: Schema.Struct({
    car: Schema.String,
    driver: Schema.String,
    wheels: Schema.Array(Schema.String),
    colliders: Schema.Array(Schema.String),
  }),
  bounds: Schema.Struct({ driver: bounds, vehicle: bounds }),
  anchors: Schema.Struct({
    cockpit: tuple,
    cameraTarget: tuple,
    hip: tuple,
    head: tuple,
    tail: tuple,
  }),
  fit: Schema.Struct({
    headClearance: Schema.Finite,
    cockpitWidthDelta: Schema.Finite,
    tailIntersections: count,
    driverHeight: Schema.Finite,
    driverLength: Schema.Finite,
  }),
});
export type DinoRaceManifest = typeof DinoRaceManifest.Type;
