import { expect, test } from "@playwright/test";

import { recordInputs } from "./input-frames";

// Emulation reports `(pointer: coarse)`, which is what reveals the control.
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { height: 844, width: 390 },
});

test("the thumbstick puts movement on the socket", async ({ page }) => {
  const inputs = recordInputs(page);
  await page.goto("/");

  const stick = page.getByTestId("thumbstick");
  await expect(stick).toBeVisible();

  const bounds = await stick.boundingBox();
  if (!bounds) {
    throw new Error("Expected the thumbstick to be measurable");
  }
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;

  // Up and to the left, which is W plus A: negative on both axes.
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX - 40, centreY - 40);
  await page.waitForTimeout(80);
  await page.mouse.move(centreX - 50, centreY - 50);
  await page.waitForTimeout(80);

  await expect
    .poll(() => inputs.some((input) => input.x < 0 && input.z < 0))
    .toBe(true);

  await page.mouse.up();

  // Releasing must stop the avatar even though the last move may have been
  // dropped by the send throttle.
  await expect.poll(() => inputs.at(-1)).toEqual({ x: 0, z: 0 });

  // Analogue, not the keyboard's -1/0/1: at least one value strictly inside.
  expect(
    inputs.some(
      (input) =>
        (input.x !== 0 && Math.abs(input.x) < 1) ||
        (input.z !== 0 && Math.abs(input.z) < 1)
    )
  ).toBe(true);
});

test("the thumbstick stays out of the way on a desktop pointer", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByTestId("thumbstick")).toBeHidden();

  await context.close();
});
