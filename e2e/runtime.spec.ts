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

test("keeps its identity across a reload", async ({ browser, page }) => {
  await page.goto("/");
  const client = page.getByTestId("client-id");
  await expect(client).toHaveAttribute("data-client-id", /^cli_/u);
  const before = await client.getAttribute("data-client-id");

  await page.reload();
  await expect(client).toHaveAttribute("data-client-id", /^cli_/u);
  expect(await client.getAttribute("data-client-id")).toBe(before);

  // Identity is per tab, so a second one is a second player rather than a
  // takeover of the first.
  const other = await browser.newPage();
  await other.goto("/");
  const otherClient = other.getByTestId("client-id");
  await expect(otherClient).toHaveAttribute("data-client-id", /^cli_/u);
  expect(await otherClient.getAttribute("data-client-id")).not.toBe(before);
  await other.close();
});
