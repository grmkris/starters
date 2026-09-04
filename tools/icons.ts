import { mkdirSync } from "node:fs";

import { chromium } from "@playwright/test";

/**
 * Generates every icon and startup image from one vector mark.
 *
 * Rendering each size from the same artwork is what stops them drifting apart,
 * and the colours are read out of `globals.css` rather than restated here, so
 * the splash, the icons, the manifest and the page background cannot disagree.
 * A mismatch between them shows to a user as a flash between the splash screen
 * and first paint.
 *
 * Chromium is the renderer because Playwright is already a dev dependency and
 * this box has no image tooling at all.
 */

const OUT = "apps/web/public";
const CSS = "packages/ui/src/styles/globals.css";
const INDEX = "apps/web/index.html";

/** Bump when the artwork changes; iOS caches splash images aggressively. */
const SPLASH_VERSION = 1;

/**
 * CSS points, portrait, with device pixel ratio. iOS picks a startup image only
 * on an exact match of width, height and ratio, so the key is the triple and
 * not the device name - a dozen iPhones share three of these.
 */
const DEVICES: readonly (readonly [number, number, number])[] = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [420, 912, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [744, 1133, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [834, 1210, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
];

const css = await Bun.file(CSS).text();

const token = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*([^;]+);`, "u").exec(css);
  const value = match?.[1]?.trim();
  if (value === undefined) {
    throw new Error(`${CSS} does not define --${name}`);
  }
  return value;
};

const surface = token("background");
const cube = token("scene-local");
const cubeShade = token("scene-local-emissive");
const grid = token("scene-grid");

/** The isometric player cube, on the grid it stands on. */
const mark = (withGrid: boolean): string => `
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    ${
      withGrid
        ? `<g stroke="${grid}" stroke-width="0.7" opacity="0.85">
             ${[20, 35, 50, 65, 80]
               .map((y) => `<line x1="6" y1="${y}" x2="94" y2="${y}" />`)
               .join("")}
             ${[20, 35, 50, 65, 80]
               .map((x) => `<line x1="${x}" y1="6" x2="${x}" y2="94" />`)
               .join("")}
           </g>`
        : ""
    }
    <polygon points="50,18 78,34 50,50 22,34" fill="${cube}" />
    <polygon points="22,34 50,50 50,82 22,66" fill="${cubeShade}" />
    <polygon
      points="78,34 50,50 50,82 78,66"
      fill="color-mix(in oklab, ${cube} 42%, ${surface})"
    />
  </svg>`;

const page = (size: number, inset: number, withGrid: boolean): string => `
  <html><body style="margin:0;background:${surface};width:${size}px;height:${size}px;
    display:grid;place-items:center">
    <div style="width:${size * inset}px;height:${size * inset}px">${mark(withGrid)}</div>
  </body></html>`;

const splashPage = (width: number, height: number): string => `
  <html><body style="margin:0;background:${surface};width:${width}px;height:${height}px;
    display:grid;place-items:center">
    <div style="width:${Math.round(Math.min(width, height) * 0.22)}px">${mark(false)}</div>
  </body></html>`;

mkdirSync(`${OUT}/splash`, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const sheet = await context.newPage();

const shot = async (
  html: string,
  width: number,
  height: number,
  path: string
): Promise<void> => {
  await sheet.setViewportSize({ height, width });
  await sheet.setContent(html);
  // `omitBackground` stays off: an apple-touch-icon with transparency is
  // composited onto black by iOS rather than onto the surface colour.
  await sheet.screenshot({ path, type: "png" });
};

// Icons. 180 for iOS, 192 and 512 for the manifest, 1024 because macOS reads
// the manifest rather than the apple-touch-icon, and a padded maskable for
// Android's safe zone.
const icons: readonly (readonly [string, number, number, boolean])[] = [
  ["icon-180.png", 180, 0.78, true],
  ["icon-192.png", 192, 0.78, true],
  ["icon-512.png", 512, 0.78, true],
  ["icon-1024.png", 1024, 0.78, true],
  ["icon-maskable-512.png", 512, 0.56, false],
  ["favicon-32.png", 32, 0.84, false],
];

for (const [name, size, inset, withGrid] of icons) {
  // One shared page renders these in turn; doing them together would need a
  // browser page each, at up to 1032x1376 points.
  // oxlint-disable-next-line eslint/no-await-in-loop
  await shot(page(size, inset, withGrid), size, size, `${OUT}/${name}`);
}

const links: string[] = [];

for (const [w, h, dpr] of DEVICES) {
  for (const orientation of ["portrait", "landscape"] as const) {
    const [pw, ph] = orientation === "portrait" ? [w, h] : [h, w];
    const file = `splash/${pw}x${ph}@${dpr}.png`;
    // As above: one page cannot render two screenshots at once.
    // oxlint-disable-next-line eslint/no-await-in-loop
    await shot(
      splashPage(pw * dpr, ph * dpr),
      pw * dpr,
      ph * dpr,
      `${OUT}/${file}`
    );
    links.push(
      `    <link\n` +
        `      rel="apple-touch-startup-image"\n` +
        `      href="/${file}?v=${SPLASH_VERSION}"\n` +
        `      media="(device-width: ${pw}px) and (device-height: ${ph}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})"\n` +
        `    />`
    );
  }
}

// Resolved in the browser because oklch cannot go in a manifest or a meta tag,
// and converting it by hand is how the splash stops matching the page.
const surfaceHex = await sheet.evaluate((colour: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context");
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[pixel[0], pixel[1], pixel[2]]
    .map((channel) => (channel ?? 0).toString(16).padStart(2, "0"))
    .join("")}`;
}, surface);

await browser.close();

const manifest = {
  background_color: surfaceHex,
  description:
    "Agent-native TypeScript runtime for realtime and spatial software",
  display: "standalone",
  icons: [
    {
      sizes: "192x192",
      src: "/icon-192.png",
      type: "image/png",
      purpose: "any",
    },
    {
      sizes: "512x512",
      src: "/icon-512.png",
      type: "image/png",
      purpose: "any",
    },
    {
      sizes: "1024x1024",
      src: "/icon-1024.png",
      type: "image/png",
      purpose: "any",
    },
    {
      sizes: "512x512",
      src: "/icon-maskable-512.png",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  id: "/",
  name: "FIELD/01 — Agent Native Runtime",
  short_name: "FIELD/01",
  start_url: "/",
  theme_color: surfaceHex,
};

await Bun.write(
  `${OUT}/manifest.webmanifest`,
  `${JSON.stringify(manifest, null, 2)}\n`
);

const declared = /name="theme-color" content="(?<hex>#[0-9a-f]{6})"/u.exec(
  await Bun.file(INDEX).text()
)?.groups?.["hex"];

if (declared !== surfaceHex) {
  console.error(
    `${INDEX} declares theme-color ${declared ?? "nothing"}, but ${CSS} resolves --background to ${surfaceHex}. A splash that does not match the page shows as a flash on launch.`
  );
  process.exitCode = 1;
}

const START = "    <!-- startup-images: generated by tools/icons.ts -->";
const END = "    <!-- /startup-images -->";
const html = await Bun.file(INDEX).text();
const before = html.indexOf(START);
const after = html.indexOf(END);

if (before === -1 || after === -1) {
  console.error(
    `${INDEX} is missing the startup-image markers; add ${START} and ${END} to its head.`
  );
  process.exitCode = 1;
} else {
  await Bun.write(
    INDEX,
    `${html.slice(0, before + START.length)}\n${links.join("\n")}\n${html.slice(after)}`
  );
  console.info(
    `Generated ${icons.length} icons, ${links.length} startup images, and the manifest (surface ${surfaceHex})`
  );
}
