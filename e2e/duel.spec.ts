import { expect, test } from "@playwright/test";

import {
  recordDuelCommands,
  recordDuelIntent,
  recordDuelSnapshots,
} from "./input-frames";

// Every duel test waits out a three-second countdown and drives two WebGL
// pages, and the suite runs several at once; half a minute is not enough on
// a shared box or a two-core runner.
test.setTimeout(60_000);

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
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });

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

  // Nothing sits in the model slot, so the procedural tank stands in, and
  // the missing file cost nothing on the console.
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-model",
    "fallback"
  );
  expect(browserErrors).toEqual([]);

  await context.close();
});

test("a model in the slot replaces the tank", async ({ browser }) => {
  const base = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext(phone);
  const page = await context.newPage();

  await page.goto(`${base}/duel`);
  await page.getByRole("button", { name: "Play the bot", exact: true }).click();
  await expect(page).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  // Same room, the hand-written stand-in in the slot.
  await page.goto(`${page.url()}?models=fixture`);
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15_000 }
  );
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-model",
    "loaded"
  );

  await context.close();
});

test("held sideways, a thumb slides across and another shoots", async ({
  browser,
}) => {
  const base = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext({
    ...phone,
    viewport: { height: 390, width: 844 },
  });
  const page = await context.newPage();
  const sent = recordDuelIntent(page);

  await page.goto(`${base}/duel`);
  await page.getByRole("button", { name: "Play the bot", exact: true }).click();
  await expect(page).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-phase",
    "playing",
    { timeout: 15_000 }
  );
  await expect(page.getByTestId("duel-root")).toHaveAttribute(
    "data-layout",
    "landscape"
  );

  const lane = await page.getByTestId("lane").boundingBox();
  if (lane === null) {
    throw new Error("The lane is not on screen");
  }
  const midY = lane.y + lane.height / 2;
  const startX = lane.x + lane.width * 0.3;

  // Two fingers through the touch device itself: the first holds a slow
  // drag across the lane, the second taps while the first is still down.
  const touch = await context.newCDPSession(page);
  const thumb = { id: 0, x: startX, y: midY };
  await touch.send("Input.dispatchTouchEvent", {
    touchPoints: [thumb],
    type: "touchStart",
  });
  for (let step = 1; step <= 8; step += 1) {
    thumb.x = startX + step * 20;
    // oxlint-disable-next-line eslint/no-await-in-loop -- a drag is a sequence
    await touch.send("Input.dispatchTouchEvent", {
      touchPoints: [thumb],
      type: "touchMove",
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- a drag is a sequence
    await page.waitForTimeout(40);
  }
  await expect.poll(() => sent.includes("duel.move")).toBe(true);
  const movesBefore = sent.filter((kind) => kind === "duel.move").length;

  const finger = { id: 1, x: lane.x + lane.width * 0.7, y: midY - 60 };
  await touch.send("Input.dispatchTouchEvent", {
    touchPoints: [thumb, finger],
    type: "touchStart",
  });
  // A touch end names the points being released: the finger goes, the thumb stays.
  await touch.send("Input.dispatchTouchEvent", {
    touchPoints: [finger],
    type: "touchEnd",
  });

  // The tap fired while the drag was still held.
  await expect.poll(() => sent.includes("duel.fire")).toBe(true);
  expect(
    sent.filter((kind) => kind === "duel.move").length
  ).toBeGreaterThanOrEqual(movesBefore);

  await touch.send("Input.dispatchTouchEvent", {
    touchPoints: [thumb],
    type: "touchEnd",
  });
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

test("a laptop plays its lane with the keys", async ({ page }) => {
  const commands = recordDuelCommands(page);
  const feed = recordDuelSnapshots(page);
  await page.goto("/duel");
  await page.getByRole("button", { name: "Play the bot", exact: true }).click();
  await expect(page).toHaveURL(/\/duel\/[A-Z2-9]{4}$/u);
  const root = page.getByTestId("duel-root");
  await expect(root).toHaveAttribute("data-phase", "playing", {
    timeout: 15_000,
  });

  // A desktop window is wide, so the lane runs across it, and a mouse means
  // the keys are worth a hint.
  await expect(root).toHaveAttribute("data-layout", "landscape");
  await expect(page.getByTestId("duel-keys")).toContainText("← →");

  // Holding right heads for the right wall, which is -z, at the rules' speed.
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() =>
      commands.some(
        (command) => command.type === "duel.move" && command.move.target < -1
      )
    )
    .toBe(true);
  await page.keyboard.up("ArrowRight");

  // The server moved a player that way; the bot follows, so at least one.
  await expect
    .poll(() =>
      Math.min(
        ...(feed.at(-1)?.players.map((player) => player.position.z) ?? [0])
      )
    )
    .toBeLessThan(-0.5);

  // Space is a straight shot; E banks it toward the right, the negative angle.
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      commands.some(
        (command) => command.type === "duel.fire" && command.fire.angle === 0
      )
    )
    .toBe(true);
  await page.keyboard.press("KeyE");
  await expect
    .poll(() =>
      commands.some(
        (command) => command.type === "duel.fire" && command.fire.angle < 0
      )
    )
    .toBe(true);
});
