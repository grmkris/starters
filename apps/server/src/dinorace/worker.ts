import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DinoRaceAssetJob,
  DinoRaceJobId,
  DinoRaceManifest,
} from "@agent-native/domain";
import { Effect, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const decodeJob = Schema.decodeUnknownSync(DinoRaceAssetJob, {
  onExcessProperty: "error",
});
export const canonicalJob = (input: DinoRaceAssetJob): string =>
  JSON.stringify(decodeJob(input));
export const jobHash = (input: DinoRaceAssetJob): string =>
  createHash("sha256").update(canonicalJob(input)).digest("hex");
export const jobPaths = (root: string, id: string) => {
  const validId = Schema.decodeUnknownSync(DinoRaceJobId)(id);
  const directory = path.resolve(root, "jobs", validId);
  return {
    directory,
    input: path.join(directory, "input.json"),
    output: path.join(directory, "output"),
    working: path.join(directory, "working"),
    logs: path.join(directory, "logs"),
  };
};
export const blenderArguments = (
  script: string,
  paths: ReturnType<typeof jobPaths>
): string[] => [
  "--background",
  "--factory-startup",
  "--disable-autoexec",
  "--threads",
  "4",
  "--python-exit-code",
  "1",
  "--python",
  script,
  "--",
  "--job",
  paths.input,
  "--output",
  paths.output,
];
export const processFailure = (code: number): string =>
  code === 127
    ? "Blender executable not found. Install Blender 4.5.3 or set BLENDER_BIN=/path/to/blender. See docs/dinorace.md for Docker."
    : `Blender exited with code ${code}. Inspect the job logs; no incomplete result is published.`;
class DinoRaceWorkerError extends Schema.TaggedError<DinoRaceWorkerError>()(
  "DinoRaceWorkerError",
  { message: Schema.String }
) {}
const io = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (error) => new DinoRaceWorkerError({ message: String(error) }),
  });

const validateOutput = async (output: string): Promise<DinoRaceManifest> => {
  const manifest = Schema.decodeUnknownSync(DinoRaceManifest)(
    JSON.parse(await readFile(path.join(output, "manifest.json"), "utf-8"))
  );
  const asset = await readFile(path.join(output, manifest.asset));
  if (
    asset.length !== manifest.bytes ||
    asset.length > 20 * 1024 * 1024 ||
    asset.toString("ascii", 0, 4) !== "glTF"
  ) {
    throw new Error("Invalid or oversized GLB output");
  }
  if (manifest.preview !== null) {
    const preview = await stat(path.join(output, manifest.preview));
    if (preview.size === 0 || preview.size > 8 * 1024 * 1024) {
      throw new Error("Invalid preview output");
    }
  }
  return manifest;
};
const scriptsHash = async (
  source: DinoRaceAssetJob["dinosaur"]["source"]
): Promise<string> => {
  const directory = path.join(repositoryRoot, "scripts/dinorace/blender");
  const entries = await readdir(directory);
  const files = entries.filter((file) => file.endsWith(".py")).toSorted();
  const hash = createHash("sha256");
  const contents = await Promise.all(
    files.map(async (file) => await readFile(path.join(directory, file)))
  );
  for (const content of contents) {
    hash.update(content);
  }
  if (source === "studio-trex") {
    hash.update(
      await readFile(path.join(directory, "../sources/studio-trex.glb"))
    );
  }
  return hash.digest("hex");
};
export interface GenerationOptions {
  readonly root: string;
  readonly blender: string;
  readonly renderDevice: "cpu" | "cuda" | "optix" | "auto";
  readonly timeoutSeconds: number;
}
export const generateAsset = Effect.fn("dinorace.generate")(
  function* generateAsset(input: DinoRaceAssetJob, options: GenerationOptions) {
    const job = yield* Effect.try({
      try: () => decodeJob(input),
      catch: (error) => new DinoRaceWorkerError({ message: String(error) }),
    });
    const inputHash = jobHash(job);
    const sourceHash = yield* io(
      async () => await scriptsHash(job.dinosaur.source)
    );
    const cachePath = path.join(
      options.root,
      "cache",
      `${inputHash}-${sourceHash}-${options.renderDevice}.json`
    );
    const cached = yield* io(async () => {
      try {
        const id = Schema.decodeUnknownSync(DinoRaceJobId)(
          JSON.parse(await readFile(cachePath, "utf-8"))
        );
        const paths = jobPaths(options.root, id);
        const manifest = await validateOutput(paths.output);
        return { manifest, paths, cached: true };
      } catch {
        return null;
      }
    });
    if (cached !== null) {
      yield* Effect.logInfo({
        stage: "cache-hit",
        jobId: cached.manifest.jobId,
        inputHash,
      });
      return cached;
    }
    const id = DinoRaceJobId.generate();
    const paths = jobPaths(options.root, id);
    yield* io(async () => {
      await Promise.all(
        [paths.output, paths.logs, paths.working, path.dirname(cachePath)].map(
          async (directory) => await mkdir(directory, { recursive: true })
        )
      );
      await writeFile(
        paths.input,
        JSON.stringify({ job, jobId: id, inputHash, pipelineVersion: "1" })
      );
    });
    yield* Effect.logInfo({ stage: "prepare", jobId: id, inputHash });
    const executable = Bun.which(options.blender);
    if (executable === null) {
      return yield* new DinoRaceWorkerError({ message: processFailure(127) });
    }
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const execute = Effect.gen(function* executeBlender() {
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          executable,
          blenderArguments(
            path.join(repositoryRoot, "scripts/dinorace/blender/build.py"),
            paths
          ),
          {
            cwd: paths.working,
            env: {
              PATH: "/usr/local/bin:/usr/bin:/bin",
              DINORACE_BLENDER_RENDER_DEVICE: options.renderDevice,
              PYTHONHASHSEED: "0",
            },
            extendEnv: false,
            killSignal: "SIGKILL",
          }
        )
      );
      let logBytes = 0;
      yield* handle.all.pipe(
        Stream.decodeText(),
        Stream.runForEach((chunk) => {
          logBytes += chunk.length;
          if (logBytes > 2 * 1024 * 1024) {
            return Effect.fail(
              new DinoRaceWorkerError({
                message: "Blender log limit exceeded (2 MB)",
              })
            );
          }
          return io(async () => {
            await writeFile(path.join(paths.logs, "blender.log"), chunk, {
              flag: "a",
            });
          });
        })
      );
      const code = yield* handle.exitCode;
      if (code !== 0) {
        yield* new DinoRaceWorkerError({
          message: processFailure(code),
        });
      }
    }).pipe(
      Effect.scoped,
      Effect.timeout(`${options.timeoutSeconds} seconds`),
      Effect.mapError(
        (failure) => new DinoRaceWorkerError({ message: String(failure) })
      )
    );
    yield* execute;
    const manifest = yield* io(async () => {
      const validated = await validateOutput(paths.output);
      return validated;
    });
    yield* io(async () => {
      await writeFile(cachePath, JSON.stringify(id));
    });
    yield* Effect.logInfo({
      stage: "succeeded",
      jobId: id,
      inputHash,
      bytes: manifest.bytes,
      triangles: manifest.triangles,
      durationSeconds: manifest.durationSeconds,
      glb: path.join(paths.output, "scene.glb"),
      preview: manifest.preview,
    });
    return { manifest, paths, cached: false };
  }
);
