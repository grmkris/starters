import { expect, test } from "@playwright/test";

test("DinoRace loads a GLB and supports engineering inspection and replay", async ({
  page,
}) => {
  // This flow includes a 30-second asset budget plus debug rendering and a resize.
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dinorace");
  await expect(page.getByTestId("dinorace-ready")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("region", { name: "Driver telemetry" })
  ).toHaveAttribute("data-racer", "unicorn");
  await expect(
    page.getByRole("region", { name: "Driver telemetry" })
  ).toContainText("TWIN-HORN UNICORN");
  await page.getByRole("button", { name: "QUALITY: AUTO" }).click();
  await page.keyboard.press("F2");
  await expect(
    page.getByRole("complementary", { name: "Engineering" })
  ).toBeVisible();
  await expect(page.getByText("Blender 4.5.3", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Wireframe/u }).click();
  // A loaded scene graph is insufficient: the racer must submit triangles.
  const triangles = page
    .locator(".dino-debug-stats > div")
    .filter({ has: page.getByText("VISIBLE TRIANGLES", { exact: true }) })
    .locator("dd");
  await expect
    .poll(
      async () => {
        const value = (await triangles.textContent()) ?? "0";
        return Number(value.replaceAll(",", ""));
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThan(20_000);
  await page.keyboard.press("F2");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause race" })).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Start race" })).toBeVisible();
  await expect(page.getByTestId("race-speed")).toHaveText("000");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Start race" })
  ).toBeInViewport();

  expect(errors).toEqual([]);
});

test("DinoRace reports missing assets and can retry", async ({ page }) => {
  await page.route("**/dinorace-assets/manifest.json*", async (route) => {
    await route.abort();
  });
  await page.goto("/dinorace");
  await expect(page.getByText("ASSET LOAD FAILED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.unroute("**/dinorace-assets/manifest.json*");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("dinorace-ready")).toBeVisible({
    timeout: 30_000,
  });
});

test("DinoRace responds to steering, braking, touch throttle, and focus loss", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dinorace");
  await expect(page.getByTestId("dinorace-ready")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("main.dinorace")).toHaveAttribute(
    "data-mode",
    "drive"
  );
  await page.keyboard.down("w");
  await expect(page.getByTestId("race-speed")).not.toHaveText("000");
  await page.keyboard.down("d");
  await expect
    .poll(async () =>
      Number(await page.locator("main.dinorace").getAttribute("data-steering"))
    )
    .toBeLessThan(-0.05);
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await page.keyboard.down("s");
  await expect(page.getByTestId("race-speed")).toHaveText("000");
  await page.keyboard.up("s");
  await page.keyboard.press("r");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Accelerate", exact: true }).hover();
  await page.mouse.down();
  await expect(page.getByTestId("race-speed")).not.toHaveText("000");
  await page.mouse.up();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await expect(page.getByRole("button", { name: "Start race" })).toBeVisible();
  await page.getByRole("button", { name: "WATCH DEMO" }).click();
  await expect(page.locator("main.dinorace")).toHaveAttribute(
    "data-mode",
    "demo"
  );
  await page.getByRole("button", { name: "TAKE WHEEL" }).click();
  await expect(page.locator("main.dinorace")).toHaveAttribute(
    "data-mode",
    "drive"
  );
  await expect(page.getByTestId("race-speed")).toHaveText("000");
  expect(errors).toEqual([]);
});
