import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { defaultDinoRaceJob, DinoRaceAssetJob } from "@agent-native/domain";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, Schema } from "effect";

import { generateAsset, repositoryRoot } from "./worker";

const program = Effect.gen(function* generateDemo() {
  const blender = yield* Config.string("BLENDER_BIN").pipe(
    Config.withDefault("blender")
  );
  const root = yield* Config.string("DINORACE_JOB_ROOT").pipe(
    Config.withDefault(path.join(repositoryRoot, ".dinorace"))
  );
  const renderDevice = yield* Config.schema(
    Schema.Literals(["cpu", "cuda", "optix", "auto"]),
    "DINORACE_BLENDER_RENDER_DEVICE"
  ).pipe(Config.withDefault("cpu"));
  const [spec] = process.argv.slice(2);
  const input: unknown =
    spec === undefined
      ? defaultDinoRaceJob
      : yield* Effect.promise(async () => {
          const parsed: unknown = JSON.parse(await readFile(spec, "utf-8"));
          return parsed;
        });
  const result = yield* generateAsset(
    Schema.decodeUnknownSync(DinoRaceAssetJob, { onExcessProperty: "error" })(
      input
    ),
    {
      blender,
      root,
      renderDevice,
      timeoutSeconds: 600,
    }
  );
  const destination = path.join(
    repositoryRoot,
    "apps/web/public/dinorace-assets"
  );
  yield* Effect.promise(async () => {
    await mkdir(destination, { recursive: true });
    await Promise.all(
      [
        "scene.glb",
        "manifest.json",
        ...(result.manifest.preview === null ? [] : ["preview.png"]),
      ].map(async (file) => {
        await cp(
          path.join(result.paths.output, file),
          path.join(destination, file)
        );
      })
    );
  });
  yield* Effect.logInfo(
    `Demo fixture ready: ${destination}. Open http://localhost:3000/dinorace`
  );
});
if (import.meta.main) {
  BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
}
