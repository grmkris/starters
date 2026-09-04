import { expect, test } from "@playwright/test";

test("boots the live runtime without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "A runtime for software that refuses to sit still.",
    })
  ).toBeVisible();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await page.getByRole("button", { name: "Send diagnostic pulse" }).click();
  await expect(page.getByText(/\d+ ms/u)).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("exposes the package architecture", async ({ page }) => {
  await page.goto("/architecture");

  await expect(
    page.getByRole("heading", { name: "Small surfaces. Hard borders." })
  ).toBeVisible();
  await expect(page.getByText("packages/game-core")).toBeVisible();
});

test("keeps compact navigation readable", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Connect wallet" })
  ).toBeVisible();

  const brandBox = await page
    .getByText("FIELD/01", { exact: true })
    .boundingBox();
  const runtimeBox = await page
    .getByRole("link", { exact: true, name: "Runtime" })
    .boundingBox();
  if (brandBox === null || runtimeBox === null) {
    throw new Error("Expected compact header controls to be measurable");
  }

  expect(brandBox.x + brandBox.width).toBeLessThan(runtimeBox.x);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});
