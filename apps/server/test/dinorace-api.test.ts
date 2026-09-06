import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  defaultDinoRaceJob,
  DinoRaceJobId,
  DinoRaceManifest,
} from "@agent-native/domain";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";

import { createDinoRaceApi } from "../src/dinorace/api";
import type { DinoRaceApi } from "../src/dinorace/api";
import { generateAsset } from "../src/dinorace/worker";

const directories: string[] = [];
const apis: DinoRaceApi[] = [];
const temporary = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "dinorace-test-"));
  directories.push(directory);
  return directory;
};
afterEach(async () => {
  await Promise.all(
    apis.splice(0).map(async (api) => {
      await api.dispose();
    })
  );
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    })
  );
});
const token = "local-test-operator-token-32-characters";
const request = (body: string, authorized = true) =>
  new Request("http://localhost/api/dinorace/jobs", {
    method: "POST",
    body,
    headers: authorized
      ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
      : {},
  });
const statusSchema = Schema.Struct({
  version: Schema.Literal(1),
  id: DinoRaceJobId,
  state: Schema.Literals(["queued", "running", "succeeded", "failed"]),
  error: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const waitForFailure = async (
  api: DinoRaceApi,
  id: DinoRaceJobId,
  remaining = 100
): Promise<void> => {
  const response = await api.respond(
    new Request(`http://localhost/api/dinorace/jobs/${id}`)
  );
  const status = Schema.decodeUnknownSync(statusSchema)(await response.json());
  if (status.state === "failed") {
    expect(status.error).toContain("BLENDER_BIN");
    return;
  }
  if (remaining === 0) {
    throw new Error("Worker did not reach failed state");
  }
  await Bun.sleep(10);
  await waitForFailure(api, id, remaining - 1);
};
describe("DinoRace worker safety and operator API", () => {
  test("maps a missing executable and kills a timed-out subprocess", async () => {
    const root = await temporary();
    const options = {
      root,
      blender: "/missing/dinorace/blender",
      renderDevice: "cpu",
      timeoutSeconds: 1,
    } satisfies Parameters<typeof generateAsset>[1];
    const missing = await Effect.runPromise(
      generateAsset(defaultDinoRaceJob, options).pipe(
        Effect.provide(BunServices.layer),
        Effect.flip
      )
    );
    expect(String(missing)).toContain("BLENDER_BIN");
    const executable = path.join(root, "slow-blender");
    await Bun.write(executable, "#!/bin/sh\nexec sleep 30\n");
    await chmod(executable, 0o700);
    const timeout = await Effect.runPromise(
      generateAsset(defaultDinoRaceJob, {
        ...options,
        blender: executable,
        timeoutSeconds: 0.1,
      }).pipe(Effect.provide(BunServices.layer), Effect.flip)
    );
    expect(String(timeout)).toContain("Timeout");
  });
  test("rejects unauthorized, executable, oversized and traversal input", async () => {
    const root = await temporary();
    const api = createDinoRaceApi(
      {
        root,
        blender: "/missing/blender",
        renderDevice: "cpu",
        timeoutSeconds: 1,
      },
      token
    );
    apis.push(api);
    const unauthorized = await api.respond(
      request(JSON.stringify(defaultDinoRaceJob), false)
    );
    expect(unauthorized.status).toBe(401);
    const executable = await api.respond(
      request(JSON.stringify({ ...defaultDinoRaceJob, python: "import os" }))
    );
    expect(executable.status).toBe(400);
    const oversized = await api.respond(request(" ".repeat(4097)));
    expect(oversized.status).toBe(400);
    const traversal = await api.respond(
      new Request(
        "http://localhost/api/dinorace/jobs/..%2f..%2fetc/assets/passwd"
      )
    );
    expect(traversal.status).toBe(404);
    const submitted = await api.respond(
      request(JSON.stringify(defaultDinoRaceJob))
    );
    expect(submitted.status).toBe(202);
    const decoded = Schema.decodeUnknownSync(statusSchema)(
      await submitted.json()
    );
    await waitForFailure(api, decoded.id);
  });
  test("the checked-in fixture is a real GLB with matching metadata and preview", async () => {
    const root = path.resolve(
      import.meta.dir,
      "../../web/public/dinorace-assets"
    );
    const manifest = Schema.decodeUnknownSync(DinoRaceManifest)(
      await Bun.file(path.join(root, "manifest.json")).json()
    );
    const binary = await Bun.file(
      path.join(root, manifest.asset)
    ).arrayBuffer();
    expect(new TextDecoder().decode(binary.slice(0, 4))).toBe("glTF");
    expect(binary.byteLength).toBe(manifest.bytes);
    expect(manifest.bytes).toBeLessThan(20 * 1024 * 1024);
    const length = new DataView(binary).getUint32(12, true);
    const gltf = Schema.decodeUnknownSync(
      Schema.Struct({
        nodes: Schema.Array(
          Schema.Struct({ name: Schema.optionalKey(Schema.String) })
        ),
      })
    )(JSON.parse(new TextDecoder().decode(binary.slice(20, 20 + length))));
    const names = new Set(gltf.nodes.map((node) => node.name));
    for (const name of [
      manifest.objects.car,
      manifest.objects.driver,
      ...manifest.objects.wheels,
      ...manifest.objects.colliders,
      ...manifest.identity.horns,
    ]) {
      expect(names.has(name)).toBe(true);
    }
    expect(manifest.identity.species).toBe("unicorn");
    expect(manifest.identity.horns).toHaveLength(2);
    expect(manifest.identity.name).toBe("AURELIA");
    expect(manifest.fit.cockpitWidthDelta).toBeGreaterThan(0);
    expect(await Bun.file(path.join(root, "preview.png")).exists()).toBe(true);
  });
});

test.skipIf(process.env["DINORACE_BLENDER_SMOKE"] !== "1")(
  "headless Blender exports a validated racer and preview",
  async () => {
    const root = await temporary();
    const result = await Effect.runPromise(
      generateAsset(defaultDinoRaceJob, {
        root,
        blender: process.env["BLENDER_BIN"] ?? "blender",
        renderDevice: "cpu",
        timeoutSeconds: 110,
      }).pipe(Effect.provide(BunServices.layer))
    );
    expect(result.manifest.blenderVersion).toContain("4.5.3");
    expect(result.manifest.triangles).toBeGreaterThan(1000);
    expect(result.manifest.bytes).toBeLessThan(20 * 1024 * 1024);
    expect(result.manifest.fit.cockpitWidthDelta).toBeGreaterThan(0);
  },
  120_000
);
