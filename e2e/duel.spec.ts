import { expect, test } from "@playwright/test";

import { recordDuelSnapshots } from "./input-frames";

/** Two portrait phones. */
const phone = {
  hasTouch: true,
  isMobile: true,
  viewport: { height: 844, width: 390 },
};

test("a shot fired on one phone crosses onto the other", async ({
  browser,
}) => {
  const base = test.info().project.use.baseURL ?? "";
  const hostContext = await browser.newContext(phone);
  const guestContext = await browser.newContext(phone);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const guestFeed = recordDuelSnapshots(guest);

  await host.goto(`${base}/duel`);
  await host.getByRole("button", { name: "New duel" }).click();
  await expect(host).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  const code = await host.getByTestId("duel-code").textContent();
  if (code === null) {
    throw new Error("The host page showed no code");
  }

  await guest.goto(`${base}/duel/${code}`);

  // Both phones count down and play once the second one arrives.
  await expect(host.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15_000 }
  );
  await expect(guest.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing"
  );

  // A tap on the host's lane is a straight shot toward the seam.
  const lane = host.getByTestId("lane");
  const box = await lane.boundingBox();
  if (box === null) {
    throw new Error("The lane is not on screen");
  }
  await host.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  // The guest's own feed shows the shot past the seam: x > 0 is their lane.
  await expect
    .poll(
      () =>
        guestFeed.some((frame) =>
          frame.projectiles.some((projectile) => projectile.position.x > 0)
        ),
      { timeout: 5000 }
    )
    .toBe(true);

  await guestContext.close();
  await hostContext.close();
});

test("a code nobody minted is refused", async ({ page }) => {
  await page.goto("/duel/ZZZZ");

  await expect(page.getByTestId("duel-error")).toBeVisible();
});

test("the bot turns up when asked", async ({ browser }) => {
  const base = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  const feed = recordDuelSnapshots(page);

  await page.goto(`${base}/duel`);
  await page.getByRole("button", { name: "Play the bot", exact: true }).click();
  await expect(page).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15_000 }
  );

  // The bot fires on its own; nothing on this page was tapped.
  await expect
    .poll(() => feed.some((frame) => frame.projectiles.length > 0), {
      timeout: 5000,
    })
    .toBe(true);

  await context.close();
});

test("two strangers waiting are paired", async ({ browser }) => {
  const base = test.info().project.use.baseURL ?? "";
  const oneContext = await browser.newContext(phone);
  const twoContext = await browser.newContext(phone);
  const one = await oneContext.newPage();
  const two = await twoContext.newPage();

  await one.goto(`${base}/duel`);
  await one.getByRole("button", { name: "Play anyone" }).click();
  await expect(one.getByTestId("duel-queue")).toBeVisible();

  await two.goto(`${base}/duel`);
  await two.getByRole("button", { name: "Play anyone" }).click();

  await expect(one).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  await expect(two).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  expect(new URL(one.url()).pathname).toBe(new URL(two.url()).pathname);
  await expect(one.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15_000 }
  );

  await one.context().close();
  await two.context().close();
});
