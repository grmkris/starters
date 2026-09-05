import { describe, expect, test } from "bun:test";

import { ClientId, makeResumeToken } from "@agent-native/domain";

import { createResumeRegistry } from "../src/resume";

const TTL_MS = 1000;

/** A clock the test moves, so no test waits for real time to pass. */
const clock = () => {
  let at = 0;
  return {
    advance: (ms: number): void => {
      at += ms;
    },
    now: (): number => at,
  };
};

const setup = () => {
  const time = clock();
  const registry = createResumeRegistry(TTL_MS, time.now);
  const clientId = ClientId.generate();
  const token = makeResumeToken();
  registry.remember(clientId, token);
  return { clientId, registry, time, token };
};

describe("resume registry", () => {
  test("honours a claim that is still attached, however old", () => {
    const { clientId, registry, time, token } = setup();

    time.advance(TTL_MS * 100);

    expect(registry.reclaim(clientId, token)).toBe(true);
  });

  test("starts the window at release, not at remember", () => {
    const { clientId, registry, time, token } = setup();

    time.advance(TTL_MS * 10);
    registry.release(clientId);
    time.advance(TTL_MS - 1);

    expect(registry.reclaim(clientId, token)).toBe(true);
  });

  test("refuses a claim once the window has passed", () => {
    const { clientId, registry, time, token } = setup();

    registry.release(clientId);
    time.advance(TTL_MS);

    expect(registry.reclaim(clientId, token)).toBe(false);
  });

  test("does not spend the claim on a wrong token", () => {
    const { clientId, registry, token } = setup();
    registry.release(clientId);

    expect(registry.reclaim(clientId, makeResumeToken())).toBe(false);
    expect(registry.reclaim(clientId, token)).toBe(true);
  });

  test("spends the claim on the right token", () => {
    const { clientId, registry, token } = setup();
    registry.release(clientId);

    expect(registry.reclaim(clientId, token)).toBe(true);
    expect(registry.reclaim(clientId, token)).toBe(false);
  });

  test("knows nothing of an identity it never issued", () => {
    const { registry, token } = setup();

    expect(registry.reclaim(ClientId.generate(), token)).toBe(false);
  });

  test("forgets an abandoned identity outright", () => {
    const { clientId, registry, token } = setup();

    registry.forget(clientId);

    expect(registry.reclaim(clientId, token)).toBe(false);
    expect(registry.size()).toBe(0);
  });

  test("drops expired claims when another is released", () => {
    const { clientId, registry, time } = setup();
    registry.release(clientId);
    time.advance(TTL_MS);

    const other = ClientId.generate();
    registry.remember(other, makeResumeToken());
    registry.release(other);

    // The expired claim went with the release; the fresh one is still there.
    expect(registry.size()).toBe(1);
  });
});
