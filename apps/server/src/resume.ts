import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

import type { ClientId, ResumeToken } from "@agent-native/domain";

/**
 * Which identities may be reclaimed, and the secret that proves each claim.
 *
 * A claim is attached while a socket holds the identity and does not expire
 * then, whatever its age: the window a client has to come back starts at the
 * disconnect, not at the connect, or anyone connected longer than the window
 * could never resume at all. An attached claim can still be reclaimed - that is
 * how a client whose drop the server has not yet noticed gets its identity
 * back - and the caller is responsible for the socket it displaces.
 */

interface Claim {
  readonly token: ResumeToken;
  /** Null while attached to a live socket. */
  readonly expiresAt: number | null;
}

export interface ResumeRegistry {
  /** The identity is held by a live socket, provable with `token`. */
  readonly remember: (clientId: ClientId, token: ResumeToken) => void;
  /** The socket holding the identity has gone; the window starts now. */
  readonly release: (clientId: ClientId) => void;
  /** The identity was abandoned, not dropped: nothing may reclaim it. */
  readonly forget: (clientId: ClientId) => void;
  /**
   * Consumes the claim if the pair matches and the window is open. A wrong
   * token leaves the claim in place: ids are public in every snapshot, so a
   * guess that spent the real holder's claim would let any room member lock
   * any other out of resuming.
   */
  readonly reclaim: (clientId: ClientId, token: ResumeToken) => boolean;
  readonly size: () => number;
}

/** Constant-time on the token, which is the bearer secret. */
const sameToken = (held: ResumeToken, offered: ResumeToken): boolean =>
  held.length === offered.length &&
  timingSafeEqual(Buffer.from(held), Buffer.from(offered));

const expired = (claim: Claim, at: number): boolean =>
  claim.expiresAt !== null && claim.expiresAt <= at;

export const createResumeRegistry = (
  ttlMs: number,
  now: () => number = Date.now
): ResumeRegistry => {
  const claims = new Map<ClientId, Claim>();

  return {
    remember: (clientId, token) => {
      claims.set(clientId, { expiresAt: null, token });
    },

    release: (clientId) => {
      const at = now();
      const claim = claims.get(clientId);
      if (claim !== undefined) {
        claims.set(clientId, { ...claim, expiresAt: at + ttlMs });
      }
      // A disconnect is the only event that grows the expiring set, so
      // sweeping here bounds it without a timer to forget.
      for (const [id, other] of claims) {
        if (expired(other, at)) {
          claims.delete(id);
        }
      }
    },

    forget: (clientId) => {
      claims.delete(clientId);
    },

    reclaim: (clientId, token) => {
      const claim = claims.get(clientId);
      if (claim === undefined) {
        return false;
      }
      if (expired(claim, now())) {
        claims.delete(clientId);
        return false;
      }
      if (!sameToken(claim.token, token)) {
        return false;
      }
      claims.delete(clientId);
      return true;
    },

    size: () => claims.size,
  };
};
