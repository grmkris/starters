# 0005 — Resume tokens

Status: accepted on 2026-09-05.

A connection is welcomed with a `ClientId` and a `ResumeToken`, and may present the pair on a later `room.join` to be known by the same id. The token is a bearer secret minted from the CSPRNG rather than a TypeID: TypeIDs are UUIDv7, time-ordered and partially predictable, which is right for an identifier and wrong for the whole of a claim. It is 128 bits, compared in constant time, and validated by schema before it reaches the registry.

Resume returns the identity and nothing else. The entity respawns, so a stolen token gets somebody's name and colour, never their position. That is what keeps empty-room collection immediate and avoids a policy for how long a vacated world persists. It is also why this is not authentication: it proves that a connection is the continuation of an earlier one, not who is behind it.

The registry in `apps/server/src/resume.ts` records four rules that each came from a fault the first implementation had.

- The window starts at the disconnect. A claim is attached, and never expires, while a socket holds the identity; `release` at close starts the timer. Starting it at connect meant anyone connected longer than the window could never resume.
- A wrong token leaves the claim in place. Ids are public in every snapshot, so a guess that spent the real holder's claim would let any room member lock any other out.
- A reclaim spends the claim and mints another under the new socket's own token. The client keeps the identity `room.joined` names and the token it was last welcomed with, and can come back as many times as it likes.
- An attached claim can still be reclaimed. That is the case where the client noticed a drop before the server did. The stale socket is put out of its room and closed with `SUPERSEDED_CLOSE_CODE`; its close handler is ignored because it no longer owns the identity.

The browser keeps the claim in `sessionStorage`, which has exactly the scope an identity has: a reload keeps it, a second tab is a second player, and closing the tab lets the server's claim expire. A duplicated tab copies that storage, and two tabs presenting one claim would take it from each other forever; the superseded close code is what breaks the loop, because a client that receives it drops the claim and asks for a fresh identity.

`room.joined` carries the effective `clientId` because the welcome's is provisional until the join is answered. A client that kept the welcome id after a successful reclaim would render its own entity as remote.

Deliberately absent: a heartbeat. Nothing bounds how long a socket the client has abandoned stays open on the server, so the supersede path is what a reconnect during that gap relies on. A heartbeat is the next realtime capability once real load says what the timeout should be; `docs/research/assessment.md` records it as deferred rather than rejected.
