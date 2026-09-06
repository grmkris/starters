import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStaticSite } from "../src/static";
import type { StaticSite } from "../src/static";

/**
 * A built site is a directory the server did not write, so the contract is
 * checked against a real one on disk: what is served, what is refused, and
 * what falls through to the router's page.
 */

let root: string;
let site: StaticSite;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "field01-static-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(
    path.join(root, "index.html"),
    "<!doctype html><title>site</title>"
  );
  writeFileSync(path.join(root, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(path.join(root, "manifest.webmanifest"), '{"name":"site"}');
  const created = await createStaticSite(root);
  if (created === null) {
    throw new Error("The fixture directory has an index.html");
  }
  site = created;
});

afterAll(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("static site", () => {
  test("is absent when there is no built page to serve", async () => {
    expect(await createStaticSite(path.join(root, "nowhere"))).toBeNull();
  });

  test("serves the page at the root", async () => {
    const response = await site.respond("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>site</title>");
  });

  test("serves a fingerprinted asset as immutable", async () => {
    const response = await site.respond("/assets/app-abc123.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(await response.text()).toBe("console.log(1)");
  });

  test("lets the page itself be revalidated on every load", async () => {
    const response = await site.respond("/");

    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("names the manifest type the browser insists on", async () => {
    const response = await site.respond("/manifest.webmanifest");

    expect(response.headers.get("content-type")).toBe(
      "application/manifest+json"
    );
  });

  test("hands a router path the page rather than a 404", async () => {
    const response = await site.respond("/architecture");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>site</title>");
  });

  test("reports a missing asset instead of serving the page in its place", async () => {
    const response = await site.respond("/assets/app-stale.js");

    expect(response.status).toBe(404);
  });

  test("reports a missing file with an extension rather than the page", async () => {
    const response = await site.respond("/models/player.glb");

    expect(response.status).toBe(404);
  });

  test("refuses a path that climbs out of the site", async () => {
    const plain = await site.respond("/../../../etc/passwd");
    const encoded = await site.respond("/%2e%2e/%2e%2e/etc/passwd");

    expect(plain.status).toBe(404);
    expect(encoded.status).toBe(404);
  });

  test("refuses a path it cannot decode", async () => {
    const response = await site.respond("/%E0%A4%A");

    expect(response.status).toBe(400);
  });
});
