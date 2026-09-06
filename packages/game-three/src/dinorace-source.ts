interface DinoRaceFrame {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly wheelRotation: number;
  readonly steeringAmount: number;
}
export interface DinoRaceSource {
  readonly getFrame: () => DinoRaceFrame;
  readonly getIntroTime: () => number;
  readonly track: readonly { readonly x: number; readonly z: number }[];
}
export type DinoRaceCamera = "cinematic" | "chase" | "trackside" | "orbit";
export type DinoRaceQuality = "auto" | "low" | "high" | "insane";
export type DinoRaceInspection = "assembly" | "driver" | "vehicle";
export interface DinoRaceDebug {
  readonly wireframe: boolean;
  readonly bounds: boolean;
  readonly rig: boolean;
  readonly colliders: boolean;
  readonly racingLine: boolean;
  readonly cameraLine: boolean;
  readonly labels: boolean;
  readonly normals: boolean;
  readonly lights: boolean;
}
export interface DinoRaceAsset {
  readonly objects: {
    readonly car: string;
    readonly driver: string;
    readonly wheels: readonly string[];
    readonly colliders: readonly string[];
  };
  readonly anchors: {
    readonly cameraTarget: readonly [number, number, number];
    readonly hip: readonly [number, number, number];
    readonly head: readonly [number, number, number];
    readonly tail: readonly [number, number, number];
  };
}
export interface DinoRaceMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
  loadMs: number;
}
export interface DinoRacePalette {
  readonly void: string;
  readonly cool: string;
  readonly warm: string;
  readonly paint: string;
}
