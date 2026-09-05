import { expect, test } from "@playwright/test";

import { recordInputs } from "./input-frames";

test("the WASD cluster puts movement on the socket", async ({ page }) => {
  const inputs = recordInputs(page);
  await page.goto("/");
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();

  // Physical key codes, which is what the hook reads.
  await page.keyboard.down("KeyW");
  await expect.poll(() => inputs.at(-1)).toEqual({ x: 0, z: -1 });

  await page.keyboard.down("KeyD");
  await expect.poll(() => inputs.at(-1)).toEqual({ x: 1, z: -1 });

  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");
  await expect.poll(() => inputs.at(-1)).toEqual({ x: 0, z: 0 });
});
