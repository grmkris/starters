---
name: kit-realtime
description: Implement or change WebSocket protocols, rooms, presence, reconnection, snapshots, or realtime state while preserving server authority and typed boundaries.
---

# Kit realtime

Use Effect Schema for every wire shape and reuse codecs from `packages/protocol`. Messages carry `v` and `seq`; reject undecoded payloads. Clients send intents or input, while the Bun server owns shared world state.

Effect owns connection lifecycle, retries, configuration, and typed transport failures. Keep simulation rate, snapshot rate, and render rate explicit. The loop consumes client intent at a tick boundary rather than on message arrival, session opens and closes are ledger events, and `snapshot()` is canonically ordered; those three are what let `apps/server/src/replay.ts` reproduce a room, so treat them as a contract and not as style. A resume claim returns an identity and nothing else, its window starts at the disconnect, and a wrong token never spends the right one; `docs/decisions/0005-resume-tokens.md` records why. Do not persist per-tick state or route transforms through React state.

For protocol changes, test valid decoding, invalid rejection, reconnect/close behavior, and multi-client presence. Add heartbeats, backpressure policy, authentication, or deltas when real load or product requirements justify them rather than as placeholders.
