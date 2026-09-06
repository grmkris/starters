import { mkdirSync } from "node:fs";

/**
 * Writes the stand-in models by hand, as glTF binaries.
 *
 * The real models come from Blender; until they do, the model slots need a
 * file to prove they load one. A glTF binary is a twelve-byte header, a JSON
 * chunk and a binary chunk, and a flat-shaded wedge is a handful of
 * triangles, so no exporter is needed. The materials are named as the
 * contract in docs/duel-models.md requires, so the same code path that will
 * recolour a Blender export recolours these.
 */

const OUT = "apps/web/public/models";

type Vec = readonly [number, number, number];

const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const normalise = (v: Vec): Vec => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Unindexed triangles with one flat normal per face. */
const flat = (triangles: readonly (readonly [Vec, Vec, Vec])[]) => {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [a, b, c] of triangles) {
    const normal = normalise(
      cross(
        [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      )
    );
    for (const vertex of [a, b, c]) {
      positions.push(...vertex);
      normals.push(...normal);
    }
  }
  return { normals, positions };
};

type Triangle = readonly [Vec, Vec, Vec];

const quad = (a: Vec, b: Vec, c: Vec, d: Vec): Triangle[] => [
  [a, b, c],
  [a, c, d],
];

/** A box from its half extents, centred at `centre`, as twelve triangles. */
const box = (centre: Vec, half: Vec): Triangle[] => {
  const [cx, cy, cz] = centre;
  const [hx, hy, hz] = half;
  const p = (sx: number, sy: number, sz: number): Vec => [
    cx + sx * hx,
    cy + sy * hy,
    cz + sz * hz,
  ];
  return [
    ...quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)),
    ...quad(p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), p(-1, -1, -1)),
    ...quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)),
    ...quad(p(-1, -1, 1), p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1)),
    ...quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)),
    ...quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)),
  ];
};

/** A wedge: a triangular prism whose point is +x, sitting on the ground. */
const wedge = (length: number, width: number, height: number) => {
  const nose: Vec = [length / 2, 0, 0];
  const backLeft: Vec = [-length / 2, 0, -width / 2];
  const backRight: Vec = [-length / 2, 0, width / 2];
  const up = (v: Vec): Vec => [v[0], height, v[2]];
  return [
    [backLeft, nose, backRight] as const,
    [up(backRight), up(nose), up(backLeft)] as const,
    [backLeft, up(backLeft), up(nose)] as const,
    [backLeft, up(nose), nose] as const,
    [nose, up(nose), up(backRight)] as const,
    [nose, up(backRight), backRight] as const,
    [backRight, up(backRight), up(backLeft)] as const,
    [backRight, up(backLeft), backLeft] as const,
  ];
};

interface Part {
  readonly name: "Body" | "Accent";
  readonly triangles: readonly Triangle[];
}

/** The parts of the glTF document this writer produces. */
interface BufferView {
  readonly buffer: 0;
  readonly byteLength: number;
  readonly byteOffset: number;
}

interface Accessor {
  readonly bufferView: number;
  readonly componentType: 5126;
  readonly count: number;
  readonly type: "VEC3";
  readonly min?: number[];
  readonly max?: number[];
}

interface Primitive {
  readonly attributes: { readonly NORMAL: number; readonly POSITION: number };
  readonly material: number;
}

const pad4 = (length: number): number => (4 - (length % 4)) % 4;

const bounds = (values: readonly number[]) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[index + axis] ?? 0;
      min[axis] = Math.min(min[axis] ?? value, value);
      max[axis] = Math.max(max[axis] ?? value, value);
    }
  }
  return { max, min };
};

const encodeGlb = (parts: readonly Part[]): Uint8Array => {
  const bufferViews: BufferView[] = [];
  const accessors: Accessor[] = [];
  const primitives: Primitive[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (values: readonly number[]): number => {
    const bytes = new Uint8Array(new Float32Array(values).buffer);
    bufferViews.push({
      buffer: 0,
      byteLength: bytes.byteLength,
      byteOffset: offset,
    });
    chunks.push(bytes);
    offset += bytes.byteLength;
    return bufferViews.length - 1;
  };

  for (const [materialIndex, part] of parts.entries()) {
    const { normals, positions } = flat(part.triangles);
    const positionView = push(positions);
    const normalView = push(normals);
    const count = positions.length / 3;
    accessors.push(
      {
        bufferView: positionView,
        componentType: 5126,
        count,
        type: "VEC3",
        ...bounds(positions),
      },
      { bufferView: normalView, componentType: 5126, count, type: "VEC3" }
    );
    primitives.push({
      attributes: {
        NORMAL: accessors.length - 1,
        POSITION: accessors.length - 2,
      },
      material: materialIndex,
    });
  }

  const json = {
    accessors,
    asset: { generator: "tools/glb.ts", version: "2.0" },
    bufferViews,
    buffers: [{ byteLength: offset }],
    materials: parts.map((part) => ({
      name: part.name,
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.8, 0.8, 1],
        metallicFactor: 0.2,
        roughnessFactor: 0.6,
      },
    })),
    meshes: [{ primitives }],
    nodes: [{ mesh: 0, name: "model" }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(
    jsonBytes.length + pad4(jsonBytes.length)
  ).fill(0x20);
  jsonPadded.set(jsonBytes);
  const binLength = offset;
  const binPadded = new Uint8Array(binLength + pad4(binLength));
  let cursor = 0;
  for (const chunk of chunks) {
    binPadded.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  // The magic, "glTF", then the version and the total length.
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  // The JSON chunk, tagged "JSON".
  view.setUint32(12, jsonPadded.length, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  out.set(jsonPadded, 20);
  const binStart = 20 + jsonPadded.length;
  // The binary chunk, tagged "BIN" with a trailing NUL.
  view.setUint32(binStart, binPadded.length, true);
  view.setUint32(binStart + 4, 0x00_4e_49_42, true);
  out.set(binPadded, binStart + 8);
  return out;
};

mkdirSync(OUT, { recursive: true });

// The player: a wedge hull within 0.8 × 0.6 × 0.8 with an accent strip on top.
await Bun.write(
  `${OUT}/player.glb`,
  encodeGlb([
    { name: "Body", triangles: wedge(0.8, 0.76, 0.26) },
    { name: "Accent", triangles: box([-0.1, 0.3, 0], [0.16, 0.04, 0.14]) },
  ])
);

// The shot: a thin wedge 0.5 long along +x.
await Bun.write(
  `${OUT}/projectile.glb`,
  encodeGlb([{ name: "Accent", triangles: wedge(0.5, 0.12, 0.1) }])
);

console.info(`Wrote ${OUT}/player.glb and ${OUT}/projectile.glb`);
