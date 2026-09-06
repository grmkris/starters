import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("DinoRace audio requires opt-in, follows driving, mutes and closes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    const contexts: AudioContext[] = [];
    const taps: AnalyserNode[] = [];
    const tapped = new WeakSet<AudioContext>();
    window.AudioContext = class extends NativeContext {
      constructor() {
        super();
        contexts.push(this);
      }
      override createGain(): GainNode {
        const node = super.createGain();
        if (!tapped.has(this)) {
          tapped.add(this);
          const tap = this.createAnalyser();
          node.connect(tap);
          taps.push(tap);
        }
        return node;
      }
    };
    window.setInterval(() => {
      let peak = 0;
      for (const tap of taps) {
        const samples = new Float32Array(tap.fftSize);
        tap.getFloatTimeDomainData(samples);
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample));
        }
      }
      document.documentElement.dataset["audioPeak"] = String(peak);
      document.documentElement.dataset["audioContexts"] = String(
        contexts.length
      );
      document.documentElement.dataset["audioClosed"] = String(
        contexts.every((context) => context.state === "closed")
      );
    }, 100);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dinorace");
  await expect(page.getByTestId("dinorace-ready")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-audio-contexts",
    "0"
  );
  await page.getByRole("button", { name: "Enable sound" }).tap();
  await expect(page.getByRole("button", { name: "Mute sound" })).toBeVisible();
  await page.keyboard.down("w");
  const peak = async () =>
    Number(await page.locator("html").getAttribute("data-audio-peak"));
  await expect.poll(peak).toBeGreaterThan(0.005);
  await page.keyboard.up("w");
  await page.getByRole("button", { name: "Pause race" }).tap();
  await expect.poll(peak).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Start race" }).tap();
  await expect.poll(peak).toBeGreaterThan(0.005);
  await page.getByRole("button", { name: "Mute sound" }).tap();
  await expect.poll(peak).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Enable sound" }).tap();
  await expect.poll(peak).toBeGreaterThan(0.005);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await expect(
    page.getByRole("button", { name: "Enable sound" })
  ).toBeVisible();
  await expect.poll(peak).toBeLessThan(0.0001);
  await page.getByRole("link", { name: "Return to Field runtime" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-audio-closed",
    "true"
  );
  expect(errors).toEqual([]);
});

test("two mobile thumbs steer and accelerate independently, with cancellation and landscape", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dinorace");
  await expect(page.getByTestId("dinorace-ready")).toBeVisible({
    timeout: 30_000,
  });
  const gas = page.getByRole("button", { name: "Accelerate", exact: true });
  const left = page.getByRole("button", { name: "Steer left" });
  const right = page.getByRole("button", { name: "Steer right" });
  const gasBox = await gas.boundingBox();
  const leftBox = await left.boundingBox();
  expect(gasBox?.height).toBeGreaterThanOrEqual(56);
  expect(leftBox?.width).toBeGreaterThanOrEqual(56);
  if (!gasBox || !leftBox) {
    throw new Error("Missing thumb controls");
  }
  const cdp = await context.newCDPSession(page);
  const throttle = {
    x: gasBox.x + gasBox.width / 2,
    y: gasBox.y + gasBox.height / 2,
    id: 1,
  };
  const steering = {
    x: leftBox.x + leftBox.width / 2,
    y: leftBox.y + leftBox.height / 2,
    id: 2,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [throttle],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [throttle, steering],
  });
  await expect(page.getByTestId("race-speed")).not.toHaveText("000");
  const yaw = async () =>
    Number(await page.locator("main.dinorace").getAttribute("data-steering"));
  await expect.poll(yaw).toBeGreaterThan(0.05);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [steering],
  });
  await expect.poll(yaw).toBeLessThan(0.02);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.getByRole("button", { name: "Reset race" }).tap();
  await page.getByRole("button", { name: "Start race" }).tap();
  await expect(page.getByTestId("race-speed")).toHaveText("000");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(gas).toBeInViewport();
  await expect(left).toBeInViewport();
  await expect(right).toBeInViewport();
  await cdp.detach();
});
