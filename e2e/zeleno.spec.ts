import { expect, test } from "@playwright/test";

test("container walkthrough stops at payment, delivers, and resets", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/zeleno");
  await expect(
    page.getByRole("heading", { name: "Z vrta. V škatlo. Zate." })
  ).toBeVisible();
  await expect(page.getByTestId("zeleno-scene")).toHaveAttribute(
    "data-ready",
    "true"
  );
  await page.screenshot({ path: "assets/zeleno/desktop.png" });
  await page.getByRole("button", { name: "Predvajaj naročilo" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "picking"
  );
  await expect
    .poll(async () =>
      Number(await page.getByTestId("zeleno-demo").getAttribute("data-time"))
    )
    .toBeGreaterThan(4.4);
  await page.getByRole("button", { name: "Začasno ustavi" }).click();
  await page.screenshot({ path: "assets/zeleno/picking.png" });
  const canvas = page.getByTestId("zeleno-scene").locator("canvas");
  const frozen = await canvas.screenshot();
  const paused = await page
    .getByTestId("zeleno-demo")
    .getAttribute("data-time");
  await page.waitForTimeout(300);
  expect(await canvas.screenshot()).toEqual(frozen);
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-time",
    paused ?? ""
  );
  await page.getByRole("button", { name: "Nadaljuj" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "payment",
    { timeout: 30_000 }
  );
  await page.waitForTimeout(300);
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "payment"
  );
  await page.screenshot({ path: "assets/zeleno/payment.png" });
  await page.getByRole("button", { name: "Potrdi demo plačilo" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "complete",
    { timeout: 10_000 }
  );
  await page.screenshot({ path: "assets/zeleno/collection.png" });
  await page.getByRole("button", { name: "Ponastavi prikaz" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "idle"
  );
  await page.getByRole("switch", { name: "Odprti prerez" }).click();
  await expect(
    page.getByRole("switch", { name: "Odprti prerez" })
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Pogled od zgoraj" }).click();
  await page.screenshot({ path: "assets/zeleno/top.png" });
  expect(errors).toEqual([]);
});

test("narrow layout and reduced motion preserve the walkthrough", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zeleno");
  await expect(page.getByTestId("zeleno-scene")).toHaveAttribute(
    "data-ready",
    "true"
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
  await page.getByRole("button", { name: "Predvajaj naročilo" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "payment"
  );
  await page.getByRole("button", { name: "Potrdi demo plačilo" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "complete"
  );
  await page.screenshot({ path: "assets/zeleno/mobile.png", fullPage: true });
});

test("failed model load offers a working retry", async ({ page }) => {
  await page.route("**/zeleno/container.glb", async (route) => {
    await route.abort();
  });
  await page.goto("/zeleno");
  await expect(page.getByRole("alert")).toContainText(
    "3D prikaza ni bilo mogoče naložiti."
  );
  await expect(
    page.getByRole("button", { name: "Predvajaj naročilo" })
  ).toBeDisabled();
  await page.unroute("**/zeleno/container.glb");
  await page.getByRole("button", { name: "Poskusi znova" }).click();
  await expect(page.getByTestId("zeleno-scene")).toHaveAttribute(
    "data-ready",
    "true"
  );
  await expect(
    page.getByRole("button", { name: "Predvajaj naročilo" })
  ).toBeEnabled();
});

test("detail views, evening lighting, and packing progress are explorable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/zeleno");
  await expect(page.getByTestId("zeleno-scene")).toHaveAttribute(
    "data-ready",
    "true"
  );
  const canvas = page.getByTestId("zeleno-scene").locator("canvas");
  const overview = await canvas.screenshot();
  await page.getByRole("button", { name: "Podrobnosti polic" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-focus",
    "produce"
  );
  await expect(
    page.getByRole("heading", { name: "Vsak pridelek ima svoje mesto." })
  ).toBeVisible();
  expect(await canvas.screenshot()).not.toEqual(overview);
  await page.screenshot({ path: "assets/zeleno/shelves.png" });
  await page.getByRole("button", { name: "Podrobnosti robota" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-focus",
    "robot"
  );
  await page.screenshot({ path: "assets/zeleno/robot.png" });
  await page.getByRole("button", { name: "Podrobnosti prevzema" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-focus",
    "pickup"
  );
  await page.screenshot({ path: "assets/zeleno/pickup.png" });
  await page.getByRole("button", { name: "Celotna prodajalna" }).click();
  const daylight = await canvas.screenshot();
  await page.getByRole("switch", { name: "Večerni pogled" }).click();
  expect(await canvas.screenshot()).not.toEqual(daylight);
  await page.screenshot({ path: "assets/zeleno/evening.png" });
  await page.getByRole("button", { name: "Predvajaj naročilo" }).click();
  await expect(page.getByTestId("zeleno-demo")).toHaveAttribute(
    "data-stage",
    "payment"
  );
  await expect(page.getByTestId("zeleno-basket-progress")).toHaveText(
    "3 / 3 v škatli"
  );
  await page.getByRole("button", { name: "Ponastavi prikaz" }).click();
  await expect(page.getByTestId("zeleno-basket-progress")).toHaveText(
    "0 / 3 v škatli"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Podrobnosti robota" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  );
  await page.screenshot({
    path: "assets/zeleno/mobile-detail.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
