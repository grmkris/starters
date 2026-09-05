import { makeRoomCode } from "@agent-native/domain";
import type { RoomCode, RoomId } from "@agent-native/domain";

/**
 * Short codes for duel rooms, and the record of which room ids are duels.
 *
 * A room id is too long to read off a friend's screen; a code is four
 * characters. The code is what one phone shows and the other types, and it
 * resolves to the room id that `room.join` then uses, so joining keeps one
 * path. A code names a room for a while and then lapses, which is enough for
 * two people at a table and bounds the map without a timer.
 */

interface Entry {
  readonly code: RoomCode;
  readonly expiresAt: number;
}

export interface RoomCodes {
  /** Names a new duel room. The id is then known to be a duel. */
  readonly mint: (roomId: RoomId) => RoomCode;
  readonly lookup: (code: RoomCode) => RoomId | undefined;
  readonly codeFor: (roomId: RoomId) => RoomCode | undefined;
  readonly isDuel: (roomId: RoomId) => boolean;
  readonly size: () => number;
}

export const createRoomCodes = (
  ttlMs: number,
  now: () => number = Date.now,
  mintCode: () => RoomCode = makeRoomCode
): RoomCodes => {
  const byRoom = new Map<RoomId, Entry>();
  const byCode = new Map<RoomCode, RoomId>();

  const sweep = (): void => {
    const at = now();
    for (const [roomId, entry] of byRoom) {
      if (entry.expiresAt <= at) {
        byRoom.delete(roomId);
        byCode.delete(entry.code);
      }
    }
  };

  return {
    mint: (roomId) => {
      sweep();
      let code = mintCode();
      // A collision is a one-in-a-million event; retrying is cheaper than
      // reasoning about one.
      while (byCode.has(code)) {
        code = mintCode();
      }
      byRoom.set(roomId, { code, expiresAt: now() + ttlMs });
      byCode.set(code, roomId);
      return code;
    },
    lookup: (code) => {
      sweep();
      return byCode.get(code);
    },
    codeFor: (roomId) => byRoom.get(roomId)?.code,
    isDuel: (roomId) => byRoom.has(roomId),
    size: () => byRoom.size,
  };
};
