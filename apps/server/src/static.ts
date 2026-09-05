import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the built web app from the same origin as the socket.
 *
 * The client talks to `/realtime` on the page's own origin and the dev server
 * proxies it, so production has to present the same shape: one origin that
 * answers both. Doing it here rather than with a reverse proxy in front keeps
 * the deployment to a single process, which is what a demo on a phone wants.
 *
 * Absent in development, where Vite serves the page. `createStaticSite`
 * returns null when the directory holds no `index.html`, and the caller falls
 * back to the JSON index it always had.
 */

export interface StaticSite {
  /** A response for `pathname`, or null when this is not a site request. */
  readonly respond: (pathname: string) => Promise<Response>;
}

/** Vite fingerprints everything under `assets/`, so those never change in place. */
const ASSETS_PREFIX = "/assets/";
const IMMUTABLE = "public, max-age=31536000, immutable";
/** Everything else - `index.html`, the manifest, icons - may change on deploy. */
const REVALIDATE = "no-cache";

const contentTypeFor = (file: string): string | null =>
  // Bun infers most types from the extension; the manifest is the one the
  // browser is strict about and Bun does not know.
  file.endsWith(".webmanifest") ? "application/manifest+json" : null;

export const createStaticSite = async (
  directory: string
): Promise<StaticSite | null> => {
  const root = path.resolve(directory);
  const index = Bun.file(`${root}/index.html`);
  if (!(await index.exists())) {
    return null;
  }

  const fallback = (): Response =>
    new Response(index, {
      headers: { "cache-control": REVALIDATE, "content-type": "text/html" },
    });

  const respond = async (pathname: string): Promise<Response> => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return new Response("Malformed path", { status: 400 });
    }

    // `resolve` collapses `..`, so a path that escapes the root shows up as
    // one that no longer starts with it. Refused before the disk is touched.
    const candidate = path.resolve(root, `.${decoded}`);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    const info = await stat(candidate).catch(() => null);
    if (info !== null && info.isFile()) {
      const cacheControl = decoded.startsWith(ASSETS_PREFIX)
        ? IMMUTABLE
        : REVALIDATE;
      const contentType = contentTypeFor(candidate);
      return new Response(Bun.file(candidate), {
        headers:
          contentType === null
            ? { "cache-control": cacheControl }
            : { "cache-control": cacheControl, "content-type": contentType },
      });
    }

    // A missing fingerprinted asset is a real 404: serving the page in its
    // place would hide a stale reference behind a confusing parse error.
    if (decoded.startsWith(ASSETS_PREFIX)) {
      return new Response("Not found", { status: 404 });
    }

    // Anything else is a route the router owns, such as `/architecture`.
    return fallback();
  };

  return { respond };
};
