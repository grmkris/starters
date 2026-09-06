import { timingSafeEqual } from "node:crypto";
import path from "node:path";

import { DinoRaceAssetJob, DinoRaceJobId } from "@agent-native/domain";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime, Schema } from "effect";

import { generateAsset } from "./worker";
import type { GenerationOptions } from "./worker";

interface JobRecord {
  readonly id: DinoRaceJobId;
  readonly input: DinoRaceAssetJob;
  state: "queued" | "running" | "succeeded" | "failed";
  output: string | null;
  error: string | null;
}
export interface DinoRaceApi {
  readonly respond: (request: Request) => Promise<Response>;
  readonly dispose: () => Promise<void>;
}
interface ApiBody {
  readonly error?: string | null;
  readonly state?: JobRecord["state"];
  readonly id?: DinoRaceJobId;
}
const json = (value: ApiBody, status = 200): Response =>
  Response.json(
    { version: 1, ...value },
    { status, headers: { "cache-control": "no-store" } }
  );
const readInput = async (request: Request): Promise<DinoRaceAssetJob> => {
  if (!request.body) {
    throw new Error("Expected a JSON job specification");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const readNext = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      throw new Error("Job specification exceeds 4096 bytes");
    }
    chunks.push(value);
    await readNext();
  };
  try {
    await readNext();
  } finally {
    reader.releaseLock();
  }
  return Schema.decodeUnknownSync(DinoRaceAssetJob, {
    onExcessProperty: "error",
  })(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
};
/** Private operator API. One serial worker, eight queued jobs, bounded history. No public execution. */
export const createDinoRaceApi = (
  options: GenerationOptions,
  token: string
): DinoRaceApi => {
  const runtime = ManagedRuntime.make(BunServices.layer);
  const records = new Map<DinoRaceJobId, JobRecord>();
  const queue: JobRecord[] = [];
  const controller = new AbortController();
  let draining = false;
  const runNext = async (): Promise<void> => {
    const record = queue.shift();
    if (!record || controller.signal.aborted) {
      return;
    }
    record.state = "running";
    try {
      const result = await runtime.runPromise(
        generateAsset(record.input, options),
        { signal: controller.signal }
      );
      record.output = result.paths.output;
      record.state = "succeeded";
    } catch (error) {
      record.state = "failed";
      record.error = String(error);
    }
    await runNext();
  };
  const drain = async (): Promise<void> => {
    if (draining) {
      return;
    }
    draining = true;
    try {
      await runNext();
    } finally {
      draining = false;
    }
  };
  const submit = async (request: Request): Promise<Response> => {
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return json({ error: "Operator authorization required" }, 401);
    }
    if (queue.length >= 8) {
      return json({ error: "Worker queue is full" }, 429);
    }
    try {
      const input = await readInput(request);
      if (queue.length >= 8) {
        return json({ error: "Worker queue is full" }, 429);
      }
      if (records.size >= 64) {
        for (const [id, record] of records) {
          if (record.state === "succeeded" || record.state === "failed") {
            records.delete(id);
            break;
          }
        }
      }
      const id = DinoRaceJobId.generate();
      const record: JobRecord = {
        id,
        input,
        state: "queued",
        output: null,
        error: null,
      };
      records.set(id, record);
      queue.push(record);
      void drain();
      return json({ id, state: "queued" }, 202);
    } catch (error) {
      return json({ error: String(error) }, 400);
    }
  };
  const respond = async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/dinorace/jobs" && request.method === "POST") {
      return await submit(request);
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }
    const match =
      /^\/api\/dinorace\/jobs\/(?<id>[^/]+)(?:\/(?<resource>manifest|assets\/(?<file>scene\.glb|preview\.png)))?$/u.exec(
        pathname
      );
    const groups = match?.groups;
    if (!groups) {
      return json({ error: "Not found" }, 404);
    }
    const { id } = groups;
    if (id === undefined || !DinoRaceJobId.is(id)) {
      return json({ error: "Not found" }, 404);
    }
    const record = records.get(id);
    if (!record) {
      return json(
        { error: "Job not found (status history is process-local)" },
        404
      );
    }
    if (groups["resource"] === undefined) {
      return json({ id: record.id, state: record.state, error: record.error });
    }
    if (record.state !== "succeeded" || record.output === null) {
      return json({ error: "Output is not ready" }, 409);
    }
    const file =
      groups["resource"] === "manifest" ? "manifest.json" : groups["file"];
    if (file === undefined) {
      return json({ error: "Not found" }, 404);
    }
    const asset = Bun.file(path.join(record.output, file));
    if (!(await asset.exists())) {
      return json({ error: "Output not found" }, 404);
    }
    return new Response(asset, {
      headers: {
        "cache-control": "private, max-age=31536000, immutable",
        "content-type": file === "scene.glb" ? "model/gltf-binary" : asset.type,
        "x-content-type-options": "nosniff",
      },
    });
  };
  return {
    respond,
    dispose: async () => {
      controller.abort();
      queue.length = 0;
      await runtime.dispose();
    },
  };
};
