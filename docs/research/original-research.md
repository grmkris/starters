Today 8:52 AM i want to build a great starter kit codebase that uses bun, typescript, effect, shadcn, threejs,websockets, realtime stuff etc.... can you explore the web and github and x discssuosn for latest trends topics etc...

eventualyl i'd liek to build some 3d games or whatever..

Yes. I dug through the current Bun/Effect/shadcn/pmndrs ecosystem, GitHub activity, and some X discussion. As of September 4, 2026, I think there’s a very coherent stack emerging for exactly what you’re describing.

The important thing is: don’t build “yet another full-stack template.” Build a modular TypeScript runtime for making weird interactive software — normal apps today, realtime/collaborative things tomorrow, and eventually 3D games/simulations.

The stack I would choose Layer My default Why Runtime / package manager Bun 1.4 Runtime, WS, SQL, Redis, S3, workers, cron, PTY etc. are increasingly native Language TypeScript Obviously Web frontend React 19 + Vite + TanStack Router Simple, game-friendly, no unnecessary server abstraction Full-stack web preset TanStack Start Optional when SSR/server rendering matters UI shadcn + Base UI + Tailwind Source-owned components + increasingly powerful registry system Domain/runtime model Effect 4 Services, Schema, errors, concurrency, resources, streams HTTP API Effect HttpApi One Schema → validation + server + client + OpenAPI Realtime transport Effect Socket/RPC → Bun WebSocket Typed realtime without another framework Reactive app state Effect Atom Fits Effect domain/application state High-frequency/game state Koota ECS Very interesting emerging pmndrs ecosystem choice 3D Three.js + React Three Fiber + Drei Huge ecosystem, React integration Renderer direction WebGPU + TSL, WebGL fallback Clearly where Three.js is headed Physics Rapier / @react-three/rapier WASM, deterministic option, mature R3F integration Local-first optional LiveStore / Zero Different problem than WS; don't bake into core Serious multiplayer Colyseus preset or your own authoritative Effect server Prediction/reconciliation/game networking Distributed rooms Cloudflare Durable Objects adapter Extremely natural room/server model

A particularly important development is Bun itself. Bun 1.4 shipped in August 2026 and has continued moving from “faster Node” toward “application runtime/platform”: native HTTP/WebSockets, SQL, Redis, S3, cron, terminal/PTY, WebView, image APIs and more. That direction is even being discussed explicitly on X as “Bun becoming a platform.”

That makes your starter kit much more compelling because you can progressively remove random infrastructure dependencies.

The architecture I think you actually want

Something approximately like this:

my-kit/ ├─ apps/ │ ├─ web/ │ │ ├─ React │ │ ├─ Vite │ │ ├─ TanStack Router │ │ └─ shadcn │ │ │ ├─ server/ │ │ ├─ Bun │ │ ├─ Effect │ │ ├─ HttpApi │ │ └─ WebSocket server │ │ │ └─ playground/ │ └─ experimental stuff / game demos │ ├─ packages/ │ ├─ domain/ │ │ ├─ schemas │ │ ├─ errors │ │ ├─ ids │ │ └─ domain services │ │ │ ├─ api/ │ │ ├─ HttpApi contracts │ │ ├─ RPC contracts │ │ └─ generated/typed clients │ │ │ ├─ realtime/ │ │ ├─ protocol │ │ ├─ transport │ │ ├─ websocket │ │ ├─ rooms │ │ └─ presence │ │ │ ├─ ui/ │ │ └─ shared shadcn components │ │ │ ├─ game-core/ │ │ ├─ Koota ECS │ │ ├─ systems │ │ ├─ simulation │ │ └─ networking state │ │ │ ├─ game-three/ │ │ ├─ R3F renderer │ │ ├─ assets │ │ ├─ materials │ │ └─ WebGPU │ │ │ ├─ physics/ │ │ └─ Rapier │ │ │ └─ config/ │ ├─ registry/ │ └─ shadcn registry definitions │ ├─ AGENTS.md ├─ CLAUDE.md └─ package.json

But there is a key architectural rule here:

game-core should know absolutely nothing about React or Three.js.

That one decision will age extremely well.

Your simulation becomes:

inputs ↓ game-core ↓ ECS / physics / systems ↓ world state ↓ renderer adapter ↓ Three.js / R3F

And the same game-core could eventually run inside:

browser Bun authoritative server headless tests replay runner AI agent simulation worker

That is much closer to an actual game engine architecture than putting the whole game inside React state.

Effect is particularly interesting right now

Effect 4.0 is currently at RC stage, and the project has consolidated a huge amount of infrastructure into the Effect ecosystem. HttpApi lets you describe endpoints once with Effect Schema and derive validated handlers, clients and OpenAPI.

There is now direct Bun infrastructure for things like:

BunHttpServer BunSocket BunSocketServer BunRedis BunRuntime Workers

which makes Effect + Bun much less awkward than it used to be.

I would therefore not use:

Effect

- Elysia
- tRPC
- another WebSocket framework
- another validation library

You'd end up with five things solving the same boundary.

Elysia 2 itself looks quite good — its 2026 rewrite focuses on AOT, startup, memory, bundle size and typed WebSockets — but if you're making this an Effect-first codebase, I'd make Elysia an optional adapter rather than part of the foundation.

So:

Effect Schema ↓ Effect HttpApi / RPC ↓ Effect Platform Bun ↓ Bun HTTP / WebSocket

That's unusually clean.

One caution: some Effect 4 infrastructure is still under effect/unstable/* while v4 reaches final stability, including HTTP/RPC/socket/reactivity-related modules. I'd pin exact versions in this starter rather than casually floating ^ versions.

shadcn has quietly become much more important

This was probably the biggest thing I found that affects how I would distribute your kit.

In 2026, shadcn registries are no longer really about UI components.

A registry item can now distribute things such as:

components hooks utilities design tokens feature kits project conventions agent instructions CI workflows release workflows templates codemods migration kits

And any public GitHub repo can act as a registry; private GitHub registries were added in August.

So instead of:

git clone kristjan/super-starter

I would eventually aim for something like:

bunx shadcn add kristjan/core bunx shadcn add kristjan/effect-api bunx shadcn add kristjan/realtime bunx shadcn add kristjan/three bunx shadcn add kristjan/game bunx shadcn add kristjan/rapier bunx shadcn add kristjan/livestore

That is much cooler than a static starter template.

Your starter becomes a composable code distribution system.

And shadcn itself changed defaults in July: Base UI is now the default for new projects, with Radix remaining supported, and React Aria becoming another first-class base.

I'd use Base UI unless you have a reason not to.

There's also an emerging “agent-native repository” pattern

This is worth taking seriously given how much coding is now agent-driven.

Bun itself now generates agent-oriented project files such as CLAUDE.md / editor rules, while shadcn registries explicitly support distributing agent instructions and project conventions.

I would therefore make the starter opinionated about agent-readable architecture.

For example:

AGENTS.md

packages/domain/AGENTS.md packages/realtime/AGENTS.md packages/game-core/AGENTS.md packages/game-three/AGENTS.md

With rules such as:

game-core cannot import React game-core cannot import Three domain cannot import infrastructure realtime messages must use Effect Schema all wire protocols need explicit versioning Effect services own side effects render loops must not use React state for per-frame values

This would massively improve Claude Code/Codex/etc. performance on the project.

This might actually be one of the strongest differentiators for the kit.

The 3D side is getting quite interesting

React Three Fiber is very much alive: GitHub currently shows roughly 32k stars, with activity as recently as August 31.

And Three.js is clearly shifting toward WebGPU + TSL.

WebGPURenderer supports WebGPU with a WebGL2 fallback, while TSL is their cross-renderer shader/node language supporting things like compute shaders, postprocessing and MRT. Three explicitly describes WebGPU as where renderer development is heading, although WebGPURenderer still carries experimental caveats.

So I would design:

renderer: "auto" | "webgpu" | "webgl"

but start new experiments with WebGPU where it works.

Koota is one I would watch very closely

This was probably my favorite find for your eventual game direction.

pmndrs/koota describes itself as:

performant real-time state management for React and TypeScript

but architecturally it's an ECS — Entity Component System designed for realtime applications, games and XR.

It is under pmndrs, is being actively worked on today, September 4, and its GitHub topics explicitly include ECS, data-oriented design and game development.

Even more tellingly, the pmndrs starter tooling now has optional integrations for:

drei rapier XR postprocessing zustand koota triplex

which is a nice signal about where that ecosystem is converging.

And on X, pmndrs is currently promoting an advanced R3F workshop involving Koota and their emerging WebGPU stack.

So I'd seriously prototype:

Effect → application / IO / domain / concurrency

Koota → realtime world state / ECS

Rapier → physics

R3F → render binding

Three.js → graphics engine

Those systems have pleasantly distinct jobs.

Effect Atom vs Koota vs React state

I'd draw a fairly hard boundary.

Effect Atom handles things like:

current user API queries settings editor state async resources connection state selected room inventory query

Effect's reactive Atom functionality is now moving into core Effect's reactivity layer, with React bindings provided separately.

Koota handles:

player position velocity health projectiles NPC entities collision state animation state game components spatial state

React state handles:

dialog open menu state input text UI tabs

And things like this:

setPlayerPosition(...)

60 times per second through React should basically be considered a crime. 😄

Realtime has actually split into two different worlds

This distinction is important.

For normal applications, the 2026 trend is increasingly toward local-first/sync engines rather than writing endless WebSocket subscriptions by hand.

Zero syncs a subset of your Postgres data into a normalized local client store and reconciles changes in the background.

LiveStore is particularly relevant to you because it uses Effect, reactive SQLite and event-sourced synchronization. It's still beta, though.

Jazz v2 is another interesting entrant but is currently alpha.

So I would expose:

preset/realtime-native preset/livestore preset/zero preset/jazz-experimental

rather than forcing a database-sync system onto every application.

Games are completely different

Do not do this:

player position ↓ LiveStore / Zero ↓ database ↓ other players

😂

Realtime games need:

client input ↓ local prediction ↓ authoritative server simulation ↓ state snapshot / delta ↓ client reconciliation ↓ render interpolation

That's where WebSockets and an actual simulation loop matter.

Colyseus is worth studying here. Its newer networking work includes client prediction, rollback, interpolation and lag compensation.

I wouldn't necessarily adopt Colyseus immediately because it somewhat competes with the architecture we're creating.

But I would absolutely steal the concepts.

Your Bun server might eventually look like:

Room ├─ World ├─ Koota ECS ├─ Rapier world ├─ fixed 60Hz simulation ├─ connected clients ├─ input buffers ├─ snapshots └─ reconciliation

That is a very nice TypeScript game-server architecture.

WebSocket now, WebTransport later

I wouldn't chase WebTransport yet.

Effect itself currently has an open 2026 proposal asking for first-class WebTransport support, specifically citing multiplayer games, live collaboration and telemetry as use cases where TCP head-of-line blocking becomes problematic.

That is a useful signal, though.

So define your own abstraction now:

interface RealtimeTransport { readonly incoming: Stream.Stream<ServerMessage, TransportError>

send( message: ClientMessage ): Effect.Effect<void, TransportError>

close(): Effect.Effect<void> }

Then:

WebSocketTransport ← default today WebTransportTransport ← later WebRTCTransport ← potentially LocalTransport ← tests

That gives you room to experiment without rewriting the protocol.

Bun's WebSocket implementation is enough to start

Bun's server WebSockets are built around uWebSockets and already include native pub/sub, compression and backpressure handling.

Your protocol should be typed by Effect Schema:

const ClientMessage = Schema.Union( JoinRoom, LeaveRoom, PlayerInput, ChatMessage, Ping )

const ServerMessage = Schema.Union( Welcome, RoomSnapshot, EntitySpawn, EntityDespawn, WorldDelta, ChatMessage, Pong )

And I would version the envelope immediately:

{ v: 1, seq: 15312, type: "player.input", roomId: "...", payload: ... }

Even if your first demo is just two cubes moving around.

Deployment should also remain modular

For a normal server:

Bun process ↓ Effect application ↓ Postgres / Redis

For globally distributed room-based things, Cloudflare Durable Objects are extremely interesting because one Durable Object can act as a stateful WebSocket server for a room and handle thousands of clients, with WebSocket hibernation explicitly targeted at things like multiplayer games/chatrooms.

So architecturally:

RoomRuntime ├─ BunRoomRuntime └─ DurableObjectRoomRuntime

could eventually be pretty sick.

One thing I would not make core: TanStack Start

I like TanStack Start a lot. It is currently RC and its API is considered feature-complete/stable on the path toward v1; Bun deployment is supported.

But for this specific starter, I'd start with:

Vite React TanStack Router Effect backend

because then there's exactly one backend.

Otherwise you get:

TanStack server functions Effect HttpApi Effect RPC WebSockets

and now you have three ways to call server code.

I'd provide:

preset/web-spa preset/tanstack-start

instead.

This is also compatible with shadcn's current monorepo tooling, which supports both Vite and TanStack Start templates.

The larger 2026 trends I see

The interesting thing is that all these seemingly separate projects are moving in roughly the same direction: runtime consolidation through Bun; schema-first typed systems through Effect; source-code distribution through shadcn registries; local-first data for application state; ECS/data-oriented state for high-frequency worlds; WebGPU/TSL for browser graphics; and agent-readable repositories becoming a real part of project architecture.

X is much noisier and less reliably indexed than GitHub/docs, so I weighted it less heavily, but the conversations I found match this direction: Bun-as-platform discussions, pmndrs pushing WebGPU/Koota, shadcn showing up inside AI-generated-app tooling, and an entire Sync Conf ecosystem around realtime/local-first/collaborative software.

And this is why I think your project should probably not even be branded as a “web starter kit.”

Conceptually, it's closer to:

A TypeScript application runtime for interactive, realtime and spatial software.

You can initially use it for:

normal SaaS dashboards realtime apps collaborative apps agent UIs 3D configurators visualizers robotics UIs multiplayer experiments browser games simulation tools

Then the 3D/game side gradually becomes more serious without needing a rewrite.

If I were starting v0.1 tomorrow

I'd lock the first vertical slice to:

Bun 1.4 → Effect 4 → Effect HttpApi → Effect WebSocket → React/Vite → shadcn → R3F → Koota → Rapier.

And the demo wouldn't be a todo app.

I'd make a tiny multiplayer 3D room: open two browser tabs, each gets a little physics capsule/cube, WASD movement is sent as input to Bun, Bun owns authoritative Koota/Rapier state, clients interpolate snapshots, and shadcn provides the connection inspector/debug UI.

That single demo forces us to solve virtually every architectural question that matters: contracts, Effect layers, WS lifecycle, room management, shared schemas, game loop, ECS, physics, rendering, latency, debug tooling, testing and deployment.

I think that's the right foundation for the codebase you're imagining.

Next I'd actually spec v0.1 of this repository in detail—exact packages/dependencies, workspace layout, Effect Layer graph, WS protocol, Koota traits/systems, build/test/lint setup, and the first multiplayer demo. That's where this starts becoming a real project rather than a stack wishlist.

Absolutely. I would make skills a first-class part of the starter kit, not an afterthought.

There has been a pretty major shift in 2026: Effect, shadcn, Koota, TanStack, Drizzle, Better Auth, Neon, Cloudflare and others are now publishing agent-facing guidance themselves. That is ideal because the agent gets library-version-aware instructions instead of relying on whatever API it remembers from training.

What I'd install Area Skill Verdict Install / source Effect Effect-TS official skills 🟢 Essential npx skills add Effect-TS/skills shadcn Official shadcn skill 🟢 Essential npx skills add shadcn/ui React performance Vercel React Best Practices 🟢 Essential npx skills add vercel-labs/agent-skills --skill react-best-practices UX/accessibility Vercel Web Design Guidelines 🟢 Essential npx skills add vercel-labs/agent-skills --skill web-design-guidelines Visual design Impeccable 🟢 Essential npx impeccable install Browser testing Anthropic webapp-testing 🟢 Essential npx skills add anthropics/skills --skill webapp-testing TanStack TanStack's package skills 🟢 Essential if used npx @tanstack/intent@latest install ECS/game state Koota official skill 🟢 Essential for games npx skills add pmndrs/koota Three/R3F games OpenAI Game Studio skills 🟢 Very relevant vendor selected skills from openai/plugins Three/WebGPU/TSL Three.js WebGPU skill pack 🟢 Very relevant npx skills add linegel/threejs-complete-set-of-skill WebGPU fundamentals cazala/webgpu-skill 🟡 Specialist install when doing GPU work Postgres Neon Postgres Best Practices 🟢 Essential npx skills add neondatabase/postgres-skills Drizzle Official Drizzle Kit skills 🟢 If using Drizzle drizzle-kit skills Auth Better Auth official skills 🟢 If using Better Auth npx skills add better-auth/skills Cloudflare Workers / Durable Objects skills 🟢 For distributed realtime npx skills add cloudflare/skills Security Sentry security-review 🟢 Good gate npx skills add getsentry/skills Debugging discipline obra/superpowers 🟡 Selectively systematic-debugging + verification Skill authoring Anthropic skill-creator 🟢 For our own pack npx skills add anthropics/skills --skill skill-creator

1. Effect — definitely install this

Effect has an official Effect-TS/skills repository now.

npx skills add Effect-TS/skills

The clever part is that its main effect-ts skill doesn't try to copy the entire Effect manual. It directs the agent to the AGENTS.md that ships with the actual installed Effect package, so guidance follows the installed version. There's also a dedicated v3 → v4 migration skill.

For our architecture this is extremely valuable because agents otherwise love producing subtly wrong Effect code.

2. shadcn — also mandatory npx skills add shadcn/ui

The official shadcn skill understands:

components.json installed components Base UI vs Radix vs Aria aliases Tailwind version themes registries presets shadcn CLI component docs

It actually calls shadcn info --json to inspect the project rather than guessing what your shadcn setup looks like.

That's exactly what we want.

Rather than an agent hallucinating:

import { SomeOldShadcnAPI } from "@/components/ui/foo"

it can inspect what exists.

3. Impeccable for actual visual taste

This one I would 100% install.

npx impeccable install

Impeccable has evolved into a pretty serious design harness: one skill, roughly 25 design commands and dozens of deterministic UI detector rules. It handles things like:

shape craft critique audit polish colorize typeset animate layout distill harden optimize

and explicitly targets the classic problem of AI-generated UI becoming:

rounded card rounded card rounded card purple gradient huge hero metric glassmorphism another card

😅

It forces an actual aesthetic direction before implementation and can iterate against the live browser.

I'd combine it with Vercel's more conservative engineering-oriented UI guidelines:

npx skills add vercel-labs/agent-skills \
--skill web-design-guidelines

npx skills add vercel-labs/agent-skills \
--skill react-best-practices

Vercel's React skill currently has around 70 rules covering waterfalls, bundles, rendering, client/server behavior and performance. Their web design skill audits accessibility, focus, forms, animation, typography, responsive behavior, touch interactions, dark mode, i18n, etc.

So:

Impeccable ↓ creative/art direction

shadcn ↓ correct implementation

Vercel UI guidelines ↓ UX/a11y audit

Vercel React ↓ performance audit

Very nice combination.

4. Browser verification needs to be mandatory

I'd install Anthropic's:

npx skills add anthropics/skills \
--skill webapp-testing

It teaches the agent a Playwright-based render → inspect → interact → screenshot → verify workflow rather than simply writing JSX and saying "done."

I would actually put a rule into our own repository:

Any user-visible UI task is not complete until the agent:

1. boots the application
2. opens the relevant route
3. checks browser errors
4. interacts with the changed functionality
5. captures rendered output
6. visually inspects it

That becomes even more important with Three.js.

5. TanStack is doing skills particularly well

This is interesting.

TanStack is starting to ship SKILL.md with the npm packages themselves.

After installing TanStack packages:

npx @tanstack/intent@latest install

The installer adds lightweight mappings so your coding agent knows where the package's version-specific skills live.

For Router, they now have skills covering things such as:

router-core search params navigation data loading auth guards code splitting SSR type safety

Start server functions middleware auth execution model server routes deployment

And the skills explicitly guard against common AI mistakes like treating TanStack Start as Next.js or assuming loaders are server-only.

That is exactly the kind of library skill we want.

6. Koota already has an official skill

Another very good sign for the stack choice:

npx skills add pmndrs/koota

The Koota team now publishes an officially maintained agent skill and explicitly intends to keep updating it as the library changes.

So our eventual game layer gets:

Effect skill + Koota skill + R3F skill + Three/WebGPU skill

which is an unusually nice AI coding environment.

7. There are now legitimately good Three.js skills

I found several.

One useful general-purpose collection is alton47/threejs-skills, which splits knowledge into:

threejs-fundamentals threejs-geometry threejs-materials threejs-lighting threejs-camera threejs-animation threejs-physics threejs-shaders threejs-postprocessing threejs-loaders threejs-react threejs-performance threejs-xr threejs-audio

and includes R3F/Drei/Rapier guidance.

But for the direction we're talking about, I actually prefer the more recent Three.js WebGPU/TSL pack:

npx skills@latest add \
linegel/threejs-complete-set-of-skill

It currently contains roughly 27 specialist skills for modern Three.js WebGPU/TSL work and has a router skill called threejs-choose-skills so the entire pack doesn't have to load at once.

There's also a focused skill specifically for modern Three.js WebGPU + TSL:

dgreenheck/webgpu-claude-skill

covering:

WebGPURenderer TSL node materials compute postprocessing custom WGSL

and it was updated for the newer Three APIs in 2026.

I'd install that only when we're actually experimenting with GPU code.

8. There's an OpenAI Game Studio skills pack worth stealing from

This one maps ridiculously closely to what we just designed.

The public OpenAI plugins repository now contains a Game Studio skill tree including:

game-studio

web-game-foundations react-three-fiber-game three-webgl-game

game-ui-frontend game-playtest

web-3d-asset-pipeline sprite-pipeline

The architecture guidance says simulation should live outside the renderer, DOM should own text-heavy UI, render/game state should remain separated, and R3F should not become the gameplay state store.

Which is basically independently arriving at the architecture I recommended before.

The R3F game skill specifically recommends:

@react-three/fiber three @react-three/drei @react-three/rapier @react-three/postprocessing @react-three/a11y

and explicitly says:

keep simulation state outside render components.

I'd vendor/adapt the relevant parts of this skill tree into our starter.

The game-playtest skill is also excellent because it requires screenshot-based testing for WebGL/canvas apps where DOM assertions can't detect visual regressions.

9. Postgres also has good first-party skills now

Neon has created a generic Postgres skill repo:

npx skills add neondatabase/postgres-skills

It covers:

schema design indexes query optimization data modeling performance common production pitfalls

It's positioned as generic Postgres guidance rather than being purely Neon-specific.

Then if we actually use Neon, they have another extensive skill suite:

neon neon-postgres branches object storage functions AI gateway observability

For the starter I'd use the generic Postgres skill and keep Neon-specific skills optional.

10. Drizzle is publishing agent skills too

Drizzle Kit added agent skills covering:

drizzle generate migrations push pull hints output modes errors

Interestingly, there's already discussion in Drizzle about not exposing eight top-level skills because every skill description consumes a little context. The suggestion is one router skill that loads the relevant reference only when necessary.

That is exactly how I think we should architect our own skills.

More on that below.

11. Better Auth has official skills

If we use Better Auth:

npx skills add better-auth/skills

Their pack includes dedicated guidance for authentication patterns and things like organizations/RBAC.

This is much better than writing our own auth rules from scratch.

12. Cloudflare skills become useful once realtime gets serious

Cloudflare has an extensive official skills repository.

Particularly relevant:

workers-best-practices durable-objects wrangler cloudflare agents-sdk

The Durable Objects guidance is obviously interesting for our eventual:

game room presence room collaborative document simulation multiplayer session

architecture.

I wouldn't install all of Cloudflare into the core starter though.

Only enable it in something like:

preset/cloudflare 13. Security skill

Sentry maintains:

npx skills add getsentry/skills

and one of the useful generic skills in there is security-review, which systematically reviews things such as:

injection XSS authentication authorization crypto misuse OWASP-style issues

and intentionally reports high-confidence findings rather than 500 speculative warnings.

I'd use that as a pre-release or PR-review skill rather than something that activates while you're prototyping.

14. And I like a small subset of Superpowers

obra/superpowers is a pretty famous skills workflow now.

I would not necessarily adopt its entire methodology, because some of it is extremely opinionated.

But I like:

systematic-debugging verification-before-completion requesting-code-review writing-plans

The debugging skill forces a root-cause → hypothesis → minimal test → fix loop instead of the classic agent behavior:

maybe this change no maybe this change still no npm install another package change four things

And verification-before-completion basically says:

you can't say it works until you actually ran the thing that proves it works.

I want that rule in our agent.

But I would NOT dump 50 skills into the agent

This is very important.

Agent Skills use progressive disclosure: the metadata is cheap and always visible, while the actual SKILL body is loaded when needed. Anthropic recommends keeping the main skill small and routing to references/scripts as necessary.

And skill repositories themselves are part of your agent's trust boundary. Anthropic explicitly warns that a mounted repository can alter agent behavior through its skills, so third-party skills should be reviewed before being trusted.

So I would make our starter expose perhaps 8–12 root skills, not 80.

What I think WE should write

This is where the starter gets really interesting.

Instead of constantly injecting:

use bun use effect don't put game state in react websockets should use schemas don't randomly add express use bun test ...

we write our own skills.

I'd structure it like this:

.agents/ └── skills/ ├── starter-architecture/ │ ├── SKILL.md │ └── references/ │ ├── boundaries.md │ ├── dependency-rules.md │ └── package-layout.md │ ├── starter-backend/ │ ├── SKILL.md │ └── references/ │ ├── effect-services.md │ ├── http-api.md │ ├── errors.md │ └── persistence.md │ ├── starter-realtime/ │ ├── SKILL.md │ └── references/ │ ├── websocket-protocol.md │ ├── rooms.md │ ├── presence.md │ ├── reconnection.md │ └── backpressure.md │ ├── starter-frontend/ │ ├── SKILL.md │ └── references/ │ ├── state-boundaries.md │ ├── routing.md │ └── server-state.md │ ├── starter-game/ │ ├── SKILL.md │ └── references/ │ ├── ecs.md │ ├── game-loop.md │ ├── simulation.md │ ├── rendering.md │ └── networking.md │ ├── starter-three/ │ ├── SKILL.md │ └── references/ │ ├── r3f.md │ ├── assets.md │ ├── physics.md │ └── performance.md │ ├── starter-testing/ │ ├── SKILL.md │ └── references/ │ ├── unit.md │ ├── integration.md │ ├── browser.md │ └── game-playtest.md │ └── starter-release/ ├── SKILL.md └── references/ ├── verification.md ├── security.md └── performance.md

And then let upstream skills handle library knowledge.

That's an important distinction:

UPSTREAM SKILLS "What API does Effect use?"

OUR SKILLS "How do WE use Effect?" Example: our realtime skill

The agent should learn rules like:

Network messages MUST be Effect Schemas.

Never expose arbitrary JSON objects on the wire.

Messages MUST use a versioned envelope.

Clients send intents/input, not authoritative state.

Server owns authoritative shared simulation state.

All connections implement:

- heartbeat
- reconnect
- exponential backoff
- connection state
- graceful close
- schema validation

Realtime state != persistent state.

Do not use React state as the high-frequency realtime store.

Do not write database rows every simulation tick.

That kind of skill will provide more value than another generic WebSocket tutorial.

And our game skill should be extremely opinionated

Something like:

simulation != rendering

game-core MUST NOT import:

- react
- three
- @react-three/fiber

game-three may import game-core.

Server simulation should be runnable headlessly.

Fixed timestep for simulation.

Render interpolation is separate from simulation.

Koota owns ECS state.

Rapier owns physics.

R3F renders world state.

React owns menus/HUD/application UI.

Effect owns IO, lifecycle, services, networking and resource management.

That will stop coding agents from slowly destroying the architecture as the game grows.

One more idea: skills become part of the product

Remember what we discovered about shadcn registries?

They can now distribute agent instructions and project conventions, not just components.

So eventually your starter could support:

bunx shadcn add kristjan/core bunx shadcn add kristjan/effect bunx shadcn add kristjan/realtime bunx shadcn add kristjan/game

and each module could install:

source code dependencies configuration SKILL.md agent rules tests examples

That is far more interesting than a boilerplate repo.

You're essentially building a:

self-explaining TypeScript application platform for humans + coding agents.

The code and the knowledge required to correctly modify the code ship together.

My initial agent loadout

For v0.1, I would keep it surprisingly tight:

npx skills add Effect-TS/skills

npx skills add shadcn/ui

npx skills add vercel-labs/agent-skills \
--skill react-best-practices

npx skills add vercel-labs/agent-skills \
--skill web-design-guidelines

npx impeccable install

npx skills add anthropics/skills \
--skill webapp-testing

npx skills add pmndrs/koota

npx skills add neondatabase/postgres-skills

npx skills add better-auth/skills

Then I'd add our own eight starter-* skills.

And only when a project turns 3D:

npx skills add linegel/threejs-complete-set-of-skill

plus the R3F/game-studio guidance.

That gives the agent expertise in design → UI → React → Effect → database → auth → realtime → testing → 3D → games, without turning its system prompt into a landfill.

I think the next useful move is to actually design the entire .agents/skills tree for this starter, including the exact trigger descriptions and first versions of starter-architecture, starter-realtime, starter-game, and starter-testing. That would effectively define the architecture of the project at the same time.

what about linting and typing? ultractire, oxlint, formater, tsgo etc...? and linters and skills for desloping and similars? also crypto/ethereum development should be enabled in such starter.. i find https://ethskills.com/ to be very relevant

Yes. I’d make Ethereum a first-class optional capability of the starter, alongside realtime and game, and I’d also tighten the quality/tooling layer substantially.

ethskills.com is particularly good because it is explicitly designed to correct stale LLM knowledge. Its top-level skill routes the agent into specialized skills for shipping, current protocol status, gas, wallets, L2s, standards, security, Foundry testing, indexing, frontend UX, QA and auditing.

So the starter becomes starter/ │ ├── core │ ├── bun │ ├── typescript 7 │ ├── effect │ ├── react │ ├── tanstack │ ├── shadcn │ └── postgres │ ├── capabilities/ │ ├── realtime/ │ ├── three/ │ ├── game/ │ ├── onchain/ │ ├── local-first/ │ └── cloudflare/ │ ├── quality/ │ ├── ultracite │ ├── oxlint │ ├── oxfmt │ ├── typescript │ ├── knip │ ├── anti-slop │ └── verification │ └── .agents/ └── skills/

And I think this is now a pretty strong opinionated stack.

Quality stack: I would use this Oxfmt ↓ formatting

Oxlint ↓ structural linting

Oxlint type-aware ↓ semantic/type-aware linting

TypeScript 7 / tsc ↓ actual type correctness

Knip ↓ dead files / exports / dependencies

anti-slop rules ↓ AI-specific bad patterns

agent deslop review ↓ taste / overengineering / nonsense

tests ↓ behavior

browser/playtest ↓ actual product verification

1. Ultracite as the policy layer

I really like Ultracite for this starter.

It currently supports:

Oxlint Oxfmt Biome ESLint Prettier Stylelint

and its initializer explicitly supports Bun + React and can install agent config/hooks.

So I'd choose:

bunx ultracite@latest init

and select:

Oxlint + Oxfmt Bun React Universal agent config Claude/Codex/etc hooks

Conceptually:

Ultracite is our code-quality policy. Oxlint/Oxfmt are the engines.

That lets us avoid hand-maintaining a 900-line lint config.

2. Oxfmt instead of Prettier

For a new 2026 project, I wouldn't default to Prettier anymore.

I'd go:

Oxfmt

especially since the rest of the stack is already using Oxc.

Then agents don't waste context debating formatting.

They write code.

Formatter decides.

3. Oxlint instead of ESLint

Same idea.

I'd make Oxlint the default linter.

And importantly it now has type-aware linting:

bun add -D oxlint-tsgolint

with:

oxlint --type-aware

or:

export default defineConfig({ options: { typeAware: true, }, })

Oxlint then enables its type-aware TypeScript rule namespace.

So initially:

ESLint: NO Biome: NO Prettier: NO

Oxlint: YES Oxfmt: YES

Unless some future library genuinely requires ESLint-specific plugins.

4. TypeScript 7, not tsgo

This changed literally two months ago.

TypeScript 7 shipped on July 8, 2026.

The Go compiler is now simply:

bun add -D typescript bunx tsc

Microsoft reports typical full-build improvements around 8–12×, thanks to the native Go port and parallelism.

So forget:

tsgo @typescript/native-preview

Those were migration-era names.

Use:

tsc --noEmit

as the canonical typecheck.

One caveat

TS7 doesn't expose its stable programmatic compiler API yet; that is expected with TS7.1. Some tools that embed the old TypeScript API may temporarily need TS6 compatibility.

That's actually another argument against building our stack around typescript-eslint.

Oxlint + direct tsc fits this transition much better.

5. Knip should absolutely be mandatory

I would make Knip one of the CI gates.

It catches stuff linters don't:

unused files unused exports unused types unused dependencies missing dependencies unused binaries workspace dependency leakage

It explicitly supports Bun and monorepos.

For CI I'd eventually use:

bunx knip

and the stricter production check:

bunx knip --production --strict

--strict also verifies workspace dependency isolation, peer dependencies and development-vs-production type use.

This is especially useful with coding agents, because agents are notorious for doing:

bun add random-library

using it once, replacing the implementation, and leaving the dependency forever.

Then comes the interesting part: anti-slop

Normal linters catch:

const unused = foo

They don't catch:

interface UserManagerInterface { manageUserManagementOperations( userManagementInput: UserManagementInput ): Promise<UserManagementOperationResult> }

when:

updateUser()

was enough.

😄

That's where we need another layer.

There is literally an Oxlint anti-slop project now

I found:

dmmulroy/anti-slop

It describes itself as:

Opinionated Oxlint rules for rejecting low-evidence TypeScript and JavaScript patterns.

And it comes with an installation agent skill:

npx skills add dmmulroy/anti-slop \
--skill install-anti-slop

This is very aligned with what you're talking about.

I would inspect/vendor the useful rules rather than blindly depending on it, because it's still young.

But architecturally this is exactly right:

Oxlint + our own agent-code-quality plugin Then a /deslop skill

There are several emerging ones.

One simple version explicitly checks diffs for:

unnecessary explanatory comments

strange try/catch blocks

defensive checks that don't match the surrounding code

`as any` used to silence errors

deep nesting

patterns inconsistent with the repo

Another project, agent-sh/deslop, has a more elaborate certainty system:

HIGH definitely slop → autofix

MEDIUM probably slop → inspect

LOW possibly slop → flag only

and checks things like debug statements, placeholders, excessive comments, dead code, overengineering and infrastructure with no actual implementation.

I like that concept, but again I'd implement our own.

I'd build our own deslop skill

Because we know exactly what kind of code we don't want.

For example:

name: deslop description: > Review newly written code for AI-generated slop, unnecessary abstractions, defensive programming, comments, wrappers and complexity.

Our rules could be much stronger.

Comments

Reject:

// Get the user const user = getUser()

// Check if the user exists if (!user) {

Keep:

// Ethereum returns zero for an unset allowance, // so don't distinguish missing from zero here. Defensive slop

Reject:

try { return await db.user.find(...) } catch (error) { console.error(error) throw new Error("Something went wrong") }

when Effect already models the error channel.

Type slop

Reject:

as any

as unknown as Foo

// @ts-ignore

Record<string, any>

unless explicitly justified.

Abstraction slop

Question things like:

FooManager FooService FooHandler FooProcessor FooFactory FooRepository FooProvider

when there is only one implementation and no actual architectural reason for the abstraction.

Agent-generated file explosions

Reject:

feature/ types.ts constants.ts helpers.ts utils.ts service.ts factory.ts index.ts

for a feature containing 80 lines of code.

Compatibility slop

A huge AI problem:

const value = newFormat ?? legacyFormat ?? oldLegacyFormat ?? fallbackLegacyFormat

when the repo has never supported any of these formats.

The agent invented backwards compatibility.

Kill it.

I'd explicitly separate three things

This is important.

Deterministic oxfmt oxlint tsc knip

Always run.

Architectural

Our repo skill:

architecture-review

Checks boundaries such as:

domain → no React game-core → no Three server → Effect services wire formats → Effect Schema Taste deslop

Asks:

Could a good senior developer make this substantially simpler without losing functionality?

That's a fundamentally different question from linting.

And yes: ETHSKILLS belongs in the starter

I actually think it should be installed as a top-level router skill, not copied into our own Ethereum instructions.

ETHSKILLS already tells agents to start dApp work with its ship skill, which then routes to the relevant specialized material.

The available tree includes:

ethskills │ ├── ship ├── crops ├── protocol ├── gas ├── wallets ├── l2s ├── standards ├── tools ├── building-blocks ├── orchestration ├── addresses ├── concepts ├── security ├── noir ├── testing ├── indexing ├── frontend-ux ├── frontend-playbook ├── qa └── audit

That is excellent coverage.

Particularly good are:

addresses — stops agents hallucinating protocol addresses.

security — decimals, reentrancy, oracle issues, vault attacks and deployment checks.

testing — Foundry unit/fuzz/fork/invariant testing.

qa — explicitly designed to be given to a separate reviewer agent after implementation.

audit — much deeper EVM review covering hundreds of checks across AMMs, lending, oracles, proxies, signatures, governance, bridges, etc.

That's exactly the agent workflow we're trying to create.

I'd create an onchain capability package

Something along these lines:

packages/ ├── onchain/ │ ├── src/ │ │ ├── chains/ │ │ ├── clients/ │ │ ├── contracts/ │ │ ├── schemas/ │ │ └── index.ts │ │ │ └── AGENTS.md │ contracts/ ├── src/ ├── test/ ├── script/ └── foundry.toml

My default stack would be:

Solidity Foundry

viem wagmi

Effect Effect Schema

ETHSKILLS

And probably no ethers.js unless a third-party SDK requires it.

Since you're already comfortable with viem/wagmi, this also keeps the web3 layer consistent with the rest of the TypeScript codebase.

And Effect + Ethereum could be really nice

Instead of letting RPC calls leak everywhere:

const Ethereum = Context.Tag<Ethereum>()(...)

with services conceptually like:

EthereumRpc Wallet Chain Contracts Indexer TransactionManager

Then:

Effect ├─ retry ├─ timeouts ├─ tracing ├─ concurrency ├─ typed errors └─ resource lifecycle ↓ viem ↓ Ethereum RPC

And contract errors can become actual typed domain errors rather than:

catch (e) { console.log(e) } Game + realtime + crypto also becomes interesting

Because all of these modules share the same architecture.

For example:

browser │ ├─ React/shadcn UI │ ├─ R3F game │ ├─ wallet │ └─ Effect client │ ├── HTTP ├── WebSocket └── Ethereum RPC

Server:

Bun │ Effect ├── rooms ├── simulation ├── database ├── indexer └── Ethereum

Contracts:

Foundry ├── assets ├── identity ├── settlement └── payments

Suddenly you can make:

3D multiplayer apps onchain games prediction games agent economies wallet-enabled worlds tokenized assets DeFi dashboards AI agents paying via x402 robot/device payments

without changing stacks.

My complete quality gate

I would make one command:

bun run check

Conceptually:

1. oxfmt --check ↓
2. oxlint ↓
3. oxlint --type-aware ↓
4. tsc --noEmit ↓
5. knip ↓
6. bun test

And then:

bun run review

does:

check ↓ deslop changed files ↓ architecture review ↓ security review ↓ browser/playtest verification

For Ethereum changes:

review ↓ ETHSKILLS security ↓ forge test ↓ forge fuzz/invariants ↓ ETHSKILLS QA

And for a serious contract release:

ETHSKILLS audit This is the starter I think we should build

At this point I'd define its principles as:

Fast enough that agents run every check constantly. Strict enough that bad code has nowhere to hide. Modular enough to build SaaS, realtime apps, games, 3D experiences and Ethereum software from the same TypeScript foundation.

The stack I'd currently lock in is:

Bun 1.4 TypeScript 7

Effect 4

React TanStack Router shadcn / Base UI Tailwind

Oxlint Oxfmt Ultracite Knip

Postgres Drizzle

Three.js R3F Koota Rapier

viem wagmi Foundry ETHSKILLS

- our own: architecture realtime game onchain testing deslop verification skills

That is starting to look less like a starter template and more like a really compelling agent-native TypeScript engineering environment.

Claude finished the response Searched the web Short version of the answer: oxlint + oxfmt + tsgo, wired through Ultracite, with anti-slop vendored in. That's the combination that's actually converged, and it happens to be the one built for agent loops. Details and the reasoning:

Type checking TS 7 is GA and the binary is just tsc again — tsgo as a name is effectively gone, and the codebase migrated back into microsoft/TypeScript. Two things that bite:

No stable programmatic API until 7.1. ts-morph is fully broken. If any part of your codegen (protocol schema → client types, say) reaches for ts-morph, plan around it. The Effect LSP has a tsgo build but it's alpha and still needs @typescript/native-preview installed alongside. npx @effect/tsgo setup wires the plugin into your tsconfig. It targets v4 primarily, which is what you want. The Effect LSP is the single highest-leverage thing on this list for your stack. Its diagnostics (anyUnknownInErrorContext, classSelfMismatch, duplicatePackage) catch exactly the mistakes an agent makes with Effect, and unlike a SKILL.md the agent can't talk itself out of a type error. The rules are now also available as type-aware OXLint rules, so you can run them in CI without the editor.

Linting oxlint + tsgolint, type-aware went stable July 22. tsgolint runs directly on typescript-go rather than embedding TS in a JS linter, covers 59 of typescript-eslint's 61 type-aware rules, and benchmarked 12-18x faster than ESLint + typescript-eslint on four large codebases. Critically: linting and type-checking share the same TypeScript program, so oxlint --type-aware isn't a second full analysis on top of tsc --noEmit.

Versioning is unusual — tsgolint tracks the TS release it supports (7.0.2001 = patch 0 for TS 7.0.2), so pin both together.

Biome is the reasonable alternative (~200 curated rules, one binary, one config, type-aware rules without the compiler) but it approximates type-awareness via fast-path analysis and produces false negatives on complex generics. With Effect v4's type-level machinery in your codebase, approximation is the wrong trade.

Context worth knowing: Cloudflare acquired VoidZero on June 4, 2026 — Vite, Vitest, Rolldown, Oxc, and Vite+ (now MIT), 19 people into Cloudflare's ETI org under Evan You. Everything stays MIT with a $1M ecosystem fund. Part of the stated rationale was explicitly agent-driven: AI agents run lint and format hundreds of times per generation session, so Oxc's speed turns that from a bottleneck into background work.

Formatting oxfmt, Prettier-compatible and ~30x faster, and the Oxc team draws the line cleanly: linter checks logic, formatter checks style. No eslint-config-prettier-style disable dance. If you'd rather have one binary for both, that's the Biome argument.

The glue: Ultracite Ultracite v7 went multi-provider — Biome, ESLint+Prettier+Stylelint, or Oxlint+Oxfmt, selected with --linter:

bash bunx ultracite@latest init --linter oxlint It installs the toolchain, merges configs, enables strictNullChecks, sets up editor integration, generates ruleset and context files for Claude Code / Cursor / Copilot so humans and models share one style, and ships an installable skill. Preset paths are now provider-scoped (ultracite/oxlint/core).

One gap to close: the Biome preset has noExcessiveCognitiveComplexity: 20, the Oxlint preset only has cyclomatic complexity. Add oxlint-plugin-complexity if you care.

Deslopping This is the part that's matured fastest, and there are three distinct layers.

1. Deterministic rules — dmmulroy/anti-slop. Custom Oxlint rules (via jsPlugins) targeting low-evidence patterns: unjustified type assertions, unknown leaking through signatures, Reflect-based access, module mocking, conditional empty object spreads. Code that compiles and passes tests but erodes type safety. Designed to be vendored, not depended on — you copy src/ into tools/oxlint/anti-slop/ and own the rules. It ships its own install skill:

bash bunx skills add dmmulroy/anti-slop --skill install-anti-slop Or take it through Ultracite, which vendors 15 of the rules as an opt-in preset with no extra install:

ts import core from "ultracite/oxlint/core"; import antiSlop from "ultracite/oxlint/anti-slop"; export default defineConfig({ extends: [core, antiSlop] }); Order matters — extend anti-slop after core, since it disables two core rules that conflict with its widening checks. And note their config ignores .claude/**, .codex/**, .cursor/** etc. so the rules don't fire inside agent scratch dirs.

The framing is right: prompts are probabilistic, lint is a hard failure. Rules the agent physically cannot ignore beat rules it agrees to and then forgets three turns later.

2. Behavioral skills — iCodeCraft/anti-slop. Three skills against agent overbuild (extra files, strategy patterns, obvious comments, drive-by refactors): kill-slop for minimal diffs, pr-hygiene, security-review.

bash bunx skills add iCodeCraft/anti-slop -a claude-code -y miqdadbadjuber/anti-slop is the other one, six skills including antislop-ui — worth a look given you're doing design work, since it catches the visual tells (bento grids, Lucide icon soup, purple-black gradients, three-column pricing, filler data) rather than code smells.

3. Repo-level gates. Effect runs their own SlopCop, a GitHub App gating PRs on check-run events for the Effect org. Different tool, same name: Brokk's SlopCop does codebase forensics and produces concrete moves, including "add this lint rule" and "write this down in AGENTS.md so the next agent doesn't repeat the mistake." That last loop is the right instinct — every recurring correction should end up as either a lint rule or a line in AGENTS.md, never as a thing you retype.

The detail that matters most for agent loops Oxlint has an agent output mode: one-line diagnostics, no summary, specifically to save tokens when used as an LLM guardrail. Use it in your Claude Code hooks. A normal lint summary dumped into context on every edit is pure waste.

Rough shape:

jsonc // package.json "lint": "oxlint --format=... ", // fast, on save / PostToolUse hook "lint:types": "oxlint --type-aware", // CI + pre-commit only "typecheck": "tsc --noEmit", "fmt": "oxfmt --write" Fast syntax pass on the hook, type-aware pass at the commit boundary. Don't put --type-aware on a per-file save hook — it builds the whole program.

For your repo specifically The generic rules won't protect your one real invariant. Write an oxlint JS plugin rule that fails on any import of effect, react, or @react-three/* from inside packages/sim/, plus one that bans allocation patterns in files under sim/systems/. That's ~40 lines against the plugin API and it's worth more than every skill in the previous message combined, because it's the boundary an agent will erode first and the one that's invisible in a diff.

Want me to write that plugin plus the full oxlint.config.ts when we scaffold?

also crypto/ethereum development should be enabled in such starter.. i find https://ethskills.com/ to be very relevant

Searched the web Good find, and it's a better fit than most crypto agent tooling because of what it's solving. It's Austin Griffith's (Scaffold-ETH), MIT, and the design is deliberate: skills live at fetchable URLs rather than being vendored, because the whole point is countering stale training data on things where being confidently wrong is expensive.

Look at what the individual skills target: protocol explicitly exists to prevent confident answers about Verkle/roadmap items from stale training, addresses exists because agents hallucinate contract addresses, gas counters the "Ethereum is expensive" misconception with current numbers. Those are exactly the failures you can't fix with a static SKILL.md, so serving them over HTTP is the right call.

Install path Use the plugin, not the prompt:

/plugin marketplace add austintgriffith/ethskills /plugin install ethskills@ethskills Their own docs draw the distinction — the plugin is user-wide, reads from disk, and does granular skill loading, whereas the AGENTS.md/Cursor pointer approach re-fetches on every task. For a repo where the agent touches Solidity maybe 10% of the time, granular loading matters. ship/SKILL.md is the router that pulls the others in.

What transfers to your stack and what doesn't Take directly: ship, protocol, gas, addresses, standards (ERC-8004 agent identity, EIP-7702 smart EOAs), security, testing (Foundry fuzz/fork/invariant, plus what LLMs get wrong), indexing, concepts, audit, crops.

Skip or heavily adapt: frontend-ux and frontend-playbook. Read the descriptions — "Mandatory frontend rules for Scaffold-ETH 2 projects," Address components, RainbowKit-style approval flows, Vercel monorepo config, IPFS deployment, SE2 branding cleanup. That's Next.js + SE2 conventions. Your frontend is Bun + Vite 8 + Base UI + Effect Atom. If you install the plugin whole, an agent will pull frontend-ux on a UI task and start recommending SE2 components that don't exist in your tree. Either exclude those two or write a project skill that overrides them explicitly.

qa is genuinely good but it's also SE2-flavored (approve button double-fire, branding cleanup). Worth reading once and rewriting against your own components.

What ethskills doesn't cover that your stack needs Crosshatch — Harry Solovay's Effect-native x402 toolkit, composing payments across EVM and Solana with chain-agnostic asset primitives. Merchant side requires and settles x402 as an Effect HTTP server response; client side is an Effect HTTP client that auto-responds to payment challenges. Given AutoToll, this is the direct continuation, and it's the only x402 implementation that speaks Effect natively rather than making you bridge into promise-land.

Two things to know before building on it: the public x402.org/facilitator is testnet-only, production needs CDP credentials or another facilitator. And governance moved to the Linux Foundation on April 2, 2026 with 22 launch members (Stripe, Visa, Mastercard, Shopify, AWS, Circle, Solana Foundation), so the spec is no longer Coinbase's to change. Real usage is more modest than the headlines — early March 2026 on-chain was ~131k daily transactions at ~$28k value, $0.20 average, roughly half looking like tests. Stripe's MPP is the competing model, session-based spending limits instead of one chain tx per request, which is the better shape for high-frequency agent calls.

Chain state facts to correct in your agent's head right now: Fusaka activated December 3, 2025 (block 23,935,694), default gas limit moved to ~60M. Glamsterdam is the live fork — ePBS (EIP-7732) plus Block-Level Access Lists (EIP-7928), described by EF engineers as the largest fork since the Merge, in hardening as of August with a realistic September–December 2026 window. Anything your model says about "upcoming Fusaka" is six months stale. This is exactly why the protocol skill routes to live sources instead of asserting.

Where the chain layer sits in the monorepo contracts/ foundry, own toolchain, own CI job packages/chain/ viem clients, typed ABIs, address registry packages/protocol/ ← Effect Schema. addresses and ABIs get schemas too. apps/web/ wagmi + Effect Atom Two opinions:

Put addresses behind an Effect Schema and a Config, never inline. The addresses skill exists because agents hallucinate them. A parsed, validated, per-chain registry that fails loudly at layer construction turns a hallucinated address from a silent mainnet transaction into a startup error. Same reasoning as the sim-boundary lint rule from before — deterministic beats instructional.

Foundry for contracts, not Hardhat. You're already on a Bun/Rust-toolchain philosophy, forge fits it, and every ethskills testing/audit skill assumes Foundry. Don't split the difference.

One caution on the audit skill audit is 500+ checklist items across 19 domains running parallel specialist agents and filing GitHub issues. That's a legitimately useful pre-review pass and it'll catch real things. It is not an audit. If anything you build holds other people's funds, that distinction is the whole liability. Use it as a filter before you pay someone, not instead.

Also worth noting: ethskills is EVM-only. Nothing in it covers Anchor, LiteSVM, or Solana account model, so if the starter is meant to be dual-chain you'd write that side yourself — and Crosshatch's chain-agnostic asset primitives are the natural seam to unify across.

Want me to sketch the packages/chain shape — Effect Schema address registry, viem clients as Layers, and the wagmi-to-Atom bridge — alongside the rest of the scaffold?

Write a message…

Claude is AI and can make mistakes. Please double-check cited sources.

Skip to main content ⌘J

i want to build a great starter kit codebase that uses bun, typescript, effect, shadcn, threejs,websockets, realtime stuff etc.... can you explore the web and github and x discssuosn for latest trends topics etc...

eventualyl i'd liek to build some 3d games or whatever..

Thought for 1m 29s Nobody ships this exact combo yet. That’s the opportunity. Here’s the Sep 2026 landscape and a kit architecture that actually fits 3D + realtime.

What’s actually happening in 2026 The TypeScript “new project” default has shifted. T3/Next is still the SaaS path. For interactive work (games, canvases, rooms), people are landing on Bun + Vite + React 19 + Tailwind v4 + shadcn, then arguing about the backend.⁠Npmjs

Layer 2026 default Notes Runtime Bun 1.4+ Native TS, native WS, Bun.serve pub/sub. TanStack Start RAM dropped ~2× on 1.4. Language TS 5.9+ (TS 7 / tsgo if you go Effect-deep) Strict mode required for Effect. UI shadcn CLI v4 + Tailwind v4 CSS-first @theme, OKLCH tokens, New York only. Base UI became the default primitive in July 2026. Radix still works (-b radix). Toast → Sonner. data-slot everywhere. Unified radix-ui package if you stay on Radix.⁠X App shell Vite SPA + TanStack Router TanStack Start if you need SSR later. Next 16 still wins content/SaaS, fights a game loop. Effects / I/O Effect v4 RC (effect@rc) Announced Aug 12. Zero-dep core, pull-based Sockets, unified WS across Bun/browser, @effect/platform-bun, RPC server notifications. This is what new kits should target.⁠Effect 3D Three r182–r184 + R3F v9.7 R3F v10 is alpha and WebGPU-first. Ship v9.7, leave a WebGPU gl factory commented.⁠R3f.docs.pmnd Game logic Koota (pmndrs ECS) Traits + systems + useQuery. Used by Viber3D. Don’t put game state in Zustand. Realtime Layered, not one library Effect RPC/WS for lobby. Colyseus later for actual netcode. X chatter is thin on this exact stack, which is the point. Effect people talk v4 RC + RPC-over-WS + Effect Atom. R3F people talk WebGPU/TSL + Koota. Scaffolding people tell friends to run bun create better-t-stack. Nobody is combining them. A kit that locks those decisions is useful because the ecosystem is too big for agents (and humans) to pick 50 tools every time.

Closest repos — steal from these, don’t clone one No repo has Bun + Effect + shadcn + Three.js + WS. Closest pieces:

Effect + Bun + realtime (study this first)

kitlangton/effect-stack — Effect + Vite + Bun + typed RPC + WebSockets + React 19 + Effect Atom + SQLite. Shared src/shared contracts. No shadcn, no 3D. This is the server/protocol shape.⁠GitHub Official: bunx create-effect-app (basic / cli / monorepo / http-server). 3D / games

instructa/viber3d (623★) — npx viber3d@latest init. R3F + Drei + Rapier + Koota ECS + Tailwind. Best game starter. No Effect, no shadcn.⁠GitHub zackabrah/r3f-starter-kit — small polished R3F + Vite + TS + Tailwind 4 + Leva + GLSL. Pin Three carefully (they pin 0.182 because of R3F THREE.Clock vs Timer).⁠GitHub pmndrs/uikit (3.2k★) — shadcn-style UI inside the canvas. @react-three/uikit-default is literally “based on Shadcn”. Game HUD / XR later, not day-1 menus.⁠GitHub Chassis / DX (don’t start a game here)

create-better-t-stack v3.42 — published this week. Bun + TanStack Router/Start + Hono/Elysia + shadcn + Drizzle + Better Auth. Hottest 2026 scaffolder. No Effect, no Three. Use as a pattern, not the kit.⁠Npmjs kriasoft/react-starter-kit — has packages/ws-protocol. Cloudflare-shaped, but the typed-WS package idea is right.⁠GitHub estepanov/fullstack-bun — Vite + React 19 + Tailwind 4 + shadcn + Hono + Biome. Realtime upgrades (not v0)

Colyseus 0.18 + @colyseus/bun-websockets — rooms, schema sync, prediction. This is what you add when the cube-sync demo becomes a game.⁠Docs.colyseus PartyKit / Durable Objects — edge rooms if you already live on Cloudflare. Liveblocks — collaborative SaaS (cursors, comments). Wrong tool for games. Hono vs Elysia: Hono if you need portability; Elysia if you want max Bun + Eden types. For this kit, skip both on day 1 and use Effect HttpApi + BunHttpServer. Dual frameworks are how starters rot.⁠Kanopylabs

Recommended kit Three hard rules, then the tree.

Effect owns I/O. HTTP, WS, Schema, retries, resources, tagged errors. Never Effect.gen inside useFrame. Koota owns the simulation. Traits on entities, systems tick the world. R3F views are dumb renderers. Zustand/Atom is only for menus and settings. Two UIs, don’t mix. shadcn = DOM overlay (lobby, pause, settings). uikit = in-world HUD later. apps/ web/ Vite + React 19 + TanStack Router + shadcn overlay + /play canvas server/ Bun.serve + @effect/platform-bun + HttpApi + RPC over WS packages/ ui/ shadcn (Base UI), owned components domain/ Effect Schema + tagged errors + RpcGroup contracts protocol/ lobby / presence / transform messages (same Schema) game/ koota world, traits, systems — no Effect in the hot loop Vite SPA + TanStack Router as the default. Not Next (RSC vs rAF), not TanStack Start on day 1 (SSR a WebGL canvas is pain). Add apps/www later if you want a marketing site.

Day-1 stack pins bun latest 1.4.x typescript ~5.9 react / react-dom 19 vite 7.x @tanstack/react-router

effect@rc @effect/platform-bun@rc @effect-atom/atom-react

three ~0.182 # pin until R3F Timer migration @react-three/fiber 9.7.x @react-three/drei 10.x @react-three/rapier koota

tailwindcss@4 @tailwindcss/vite shadcn (Base UI default, New York) lucide-react, sonner

biome # 2026 kits dropped ESLint+Prettier Skip Zod if you commit to Effect Schema. One contract language for HTTP and WS.

Realtime, layered What Transport Why Health / auth / REST Effect HttpApi Typed errors, OpenAPI for free Lobby, chat, presence, “sync this cube” Effect RPC over WebSocket Same Schema, reconnect = Effect.retry, Theo landed perMessageDeflate on BunHttpServer Actual multiplayer game later Colyseus room in apps/game-server Don’t invent prediction / matchmaking Collab editor Don’t Liveblocks is a different product v0 demo: join a room, presence count, broadcast one object’s transform. That’s enough to prove the protocol package.

What “great” means on first clone bun install && bun dev starts web + server + a scene.

shadcn lobby with live presence. /play — R3F sandbox, orbit camera, one Koota-driven entity whose transform is echoed over WS. Theme tokens in globals.css drive DOM and a couple of Three materials (useShadcnTheme). Strict TS, Biome, bun test, Effect Schema arbitraries on the protocol. AGENTS.md + short skills for Effect v4 and Koota. 2026 kits are agent-native (Viber3D already does this). The value of the kit is locking 50 decisions so an agent doesn’t invent a fourth state library. README that states the two loops and the two UIs in one paragraph. Pain to document up front Effect is polarizing. Keep it behind packages/domain + apps/server so the canvas stays readable. R3F is a renderer, not a game engine. That’s why Koota sits beside it. R3F v10 / WebGPU / TSL is the future; v9.7 is what you ship. WebGPU via async gl factory when you want it. Bun WS lifecycle has had sharp edges (proxy hangs, Effect v3 fiber-interrupt noise). Test connect / refresh / disconnect on v4 RC before you advertise “realtime.” Pin Three. Don’t float it. How I’d start, this weekend Don’t run Better-T-Stack and bolt Three on. That’s a SaaS chassis. Don’t run Viber3D and bolt Effect on. That’s a game toy.

Build the thin monorepo above. Copy three things:

Contract + RPC layout from effect-stack Overlay/theme DX from shadcn Vite monorepo init (bunx shadcn@latest init -t vite --monorepo) ECS / scene split from viber3d + koota Study bunx create-effect-app and npx viber3d@latest init — don’t ship them as the kit.

If you want, next message I can scaffold the actual repo in the workspace: package.json workspaces, Effect RPC hello-room, shadcn shell, and a /play canvas with one synced mesh. That’s the useful starter. Everything else (Rapier, uikit HUD, Colyseus, WebGPU toggle) layers on without rewriting the spine.

565 sources Find also relevant skills for thsi stacks. From design ui, backend everything that i can give to my agent

2 / 2

Thought for 1m 3s Here’s a skills pack you can drop on an agent today. Don’t install 40 of them — agents get worse when the catalog is soup. Core pack first, then the four project skills no catalog has because this combo doesn’t exist yet.

How to install Works with Cursor, Claude Code, Codex, Copilot, and ~70 others:

npx skills add <owner/repo> --skill <name> -y npx skills find <keyword> npx skills ls Commit the result (.agents/skills/ or .claude/skills/) so every clone gets the same brain.

Also turn on the two first-party loaders that ship inside packages:

bunx --bun shadcn@latest mcp init # live registry search bunx @tanstack/intent@latest install # Router/Start skills from node_modules Effect’s official skill just points the agent at node_modules/effect/AGENTS.md, so it stays locked to the RC you actually installed.⁠GitHub

Day-1 core pack (~12) Copy-paste:

# Official stack

npx skills add Effect-TS/skills --skill effect-ts -y npx skills add kitlangton/skills --skill effect -y npx skills add shadcn-ui/ui --skill shadcn -y npx skills add pmndrs/koota -y npx skills add EnzeD/r3f-skills -y

# Design (this is what stops purple-gradient slop)

npx skills add anthropics/skills --skill frontend-design -y npx skills add vercel-labs/agent-skills --skill web-design-guidelines --skill vercel-react-best-practices -y npx skills add emilkowalski/skills -y

# App shell

npx skills add tanstack-skills/tanstack-skills --skill tanstack-router -y npx skills add secondsky/claude-skills --skill tailwind-v4-shadcn -y npx skills add mikkelkrogsholm/dev-skills --skill bun --skill vite -y If Base UI is the primitive layer (July 2026 shadcn default):

npx skills add noklip-io/agent-skills --skill shadcn-base --skill base-ui -y What each one is for UI / design

Skill Install When the agent should load it shadcn (official) shadcn-ui/ui --skill shadcn Add/search/fix components. Reads components.json, Base vs Radix, bunx --bun shadcn@latest. Pair with MCP.⁠Skills frontend-design anthropics/skills --skill frontend-design Any new screen. Forces a visual direction before code. Highest-install design skill. Ban Inter/purple-blob defaults.⁠Skills web-design-guidelines vercel-labs/agent-skills “Review this UI.” 100+ a11y / focus / motion / tap-target rules, file:line output.⁠GitHub vercel-react-best-practices same repo Waterfalls, barrel imports, rerenders. Still valid off Next. emilkowalski/skills whole pack Motion taste. What not to animate. tailwind-v4-shadcn secondsky/claude-skills @theme inline, OKLCH, dark mode, tw-animate-css gotchas. shadcn-base + base-ui noklip-io/agent-skills No Radix asChild. Matches current shadcn default. Nice extras, not day-1: mattbx/shadcn-skills (search registries before inventing a table), 21st-dev/skill (generate/install blocks), ibelick/ui-skills --skill baseline-ui (compositor-only motion, h-dvh).

Effect / backend

Skill Install When effect-ts official Effect-TS/skills Any Effect file. Version-locked via node_modules/effect/AGENTS.md. Also ships effect-v3-to-v4 — keep it, don’t run it on a greenfield v4 kit.⁠GitHub effect (Kit Langton) kitlangton/skills --skill effect Opinionated v4: Effect.fn, Schema, services/layers, HTTP, streams, testing. Same person as effect-stack. bun + vite mikkelkrogsholm/dev-skills Bun.serve, native WS, bun test, Vite plugins. Live docs via llms.txt. Add later, not now:

better-auth/skills — when auth lands. Official 8-skill pack.⁠GitHub yusukebe/hono-skill or elysiajs/skills — only if you add a gateway. Day-1 is Effect HttpApi.⁠GitHub joelhooks/effectts-skills — scaffolding (/effect:service) if the official + Kit pair isn’t enough. 3D / games

Skill Install When EnzeD/r3f-skills whole pack Best current R3F set. Verified Aug 2026 against Fiber 9.7 / drei 10.7 / three r185 / Rapier 2. Fundamentals, geometry, materials, lighting, textures, loaders, animation, shaders/TSL, post, interaction, physics.⁠GitHub koota official pmndrs/koota Traits, systems, useQuery. Stops the agent putting sim state in React. verekia/r3f-gamedev whole pack Game feel: architecture, camera-shake, health bars, damage numbers, weapon trail, WebGPU setup. Use as recipes, not as the engine.⁠GitHub Optional later: emalorenzo/three-agent-skills (100+ Three + 60+ R3F rules), linegel/threejs-complete-set-of-skill (WebGPU/TSL showpieces — overkill for a starter), OpenAI’s react-three-fiber-game / three-webgl-game if you want a second opinion on “sim state stays outside the mesh.”

Realtime

There is no good first-party PartyKit skill. Colyseus now has one — add it the day you add apps/game-server:

npx skills add colyseus/skill -y Models still write pre-0.18 APIs (Room<MyState>, client.id, onMessage) without it.⁠GitHub

Until then, Effect Socket + the kit protocol skill below is enough.

Router

TanStack ships skills inside the npm package. After bun add @tanstack/react-router:

bunx @tanstack/intent@latest install That writes pointers into AGENTS.md so the agent loads router-core, search-params, data-loading, etc. from node_modules. Critical rule those skills encode: never cast inferred router types; don’t treat loaders like Next.js RSC.⁠GitHub

Write these four yourself Catalogs don’t know your two-loop / two-UI rules. Put them in the repo and commit them. This is the actual value of the kit.

.agents/skills/ kit-architecture/SKILL.md kit-protocol/SKILL.md kit-theme-3d/SKILL.md kit-realtime/SKILL.md AGENTS.md # 30-line always-on version of the same rules kit-architecture — load on any new feature.

Effect owns I/O (HTTP, WS, Schema, retries). Never Effect.gen inside useFrame. Koota owns simulation. R3F components are dumb views. Zustand / Effect Atom = menus and settings only. Monorepo map: apps/web, apps/server, packages/{ui,domain,protocol,game}. kit-protocol — load on anything that crosses the wire.

Effect Schema is the only contract. No Zod. Shared RpcGroup in packages/domain. Tagged errors, not throw new Error. kit-theme-3d — load when touching canvas or globals.css.

CSS variables → THREE.Color. No hardcoded hex in materials. Dark mode via class / MutationObserver, same tokens as shadcn. shadcn = DOM overlay (lobby, pause, settings). uikit = in-world HUD later. Don’t mix. kit-realtime — load on rooms / presence / sync.

v0: Effect RPC over WebSocket (lobby, presence, one synced transform). Later: Colyseus in apps/game-server. Load colyseus/skill then. Not Liveblocks. Not Socket.io. Root AGENTS.md should restate those hard rules in ~30 lines so every agent sees them even when it doesn’t load a skill. That’s the pattern Viber3D and effect-stack already use.

Suggested AGENTS.md skeleton

# Agent rules

Package manager and runtime: Bun. Use `bun`, `bunx --bun`, `bun test`. Never npm.

## Two loops

- I/O, validation, RPC: Effect v4 (`effect@rc`, `@effect/platform-bun`).
- Game tick: Koota systems. R3F views read traits in useFrame.
- Never Effect.gen / yield* inside useFrame.

## Two UIs

- DOM overlay: shadcn (Base UI) + Tailwind v4 tokens in globals.css.
- In-canvas HUD: @react-three/uikit, later. Not day-1 menus.

## Contracts

- Effect Schema only. Shared RpcGroup in packages/domain.
- Pin three@0.182 until R3F Timer migration.

## Skills

Load kit-architecture before new features. Load official shadcn + frontend-design before any UI. Load EnzeD r3f-fundamentals + koota before canvas work. Load Effect-TS/skills + kitlangton effect before server work. What not to install Both Effect v3 and v4 teaching skills at once. Hono + Elysia + Effect HttpApi skills together. The giant WebGPU/ocean/planet packs until you have a scene worth shading. Socket.io / Liveblocks skills. Next.js App Router skills. This kit is Vite. If the agent starts ignoring your architecture skill, the catalog is too big — delete, don’t add.

If you want this in the repo next I can scaffold .agents/skills/kit-* + AGENTS.md with the four project skills filled in, plus a skills.sh install script that pins the core pack above. That’s the piece no public catalog will write for you.

469 sources what about linting and typing? ultractire, oxlint, formater, tsgo etc...? and linters and skills for desloping and similars?

Thought for 5m 27s The 2026 DX layer is settled enough to pick one combo. Here’s how Ultracite, Oxlint, Oxfmt, tsgo, and Effect’s language service fit this kit — and which skills to give the agent.Pick one lint/format provider. The 2026 trap is running Biome + Oxlint + ESLint at the same time. Ultracite exists so you don’t have to design that graph yourself.⁠Ultracite +3

What these tools actually are (Sep 2026) Tool Role Status Ultracite 7.10.7 Zero-config preset + CLI over Biome or Oxlint+Oxfmt or ESLint+Prettier The thing Better-T-Stack and Vercel AI SDK standardized on. Ships an agent skill and editor/agent hooks. Oxlint 1.81 Rust linter (Oxc) Stable. 50–100× ESLint. Type-aware via oxlint-tsgolint is stable as of Jul 2026 (59/61 typescript-eslint typed rules). Oxfmt 0.66 Rust formatter Production-usable. ~3× Biome, ~35× Prettier. Prettier-compatible options. Official migrate skill from Prettier/Biome.⁠Npmjs Biome 2.5.x Lint + format in one binary Still the nicest all-in-one. Slightly slower than Oxc, fewer typed rules. Fine default if you don’t care about no-floating-promises. tsgo / TypeScript 7 Go rewrite of tsc + LSP TS 7.0.2 is out. Preview CLI was tsgo; stable 7 uses tsc from typescript@7. Preview package @typescript/native-preview still exposes tsgo.⁠Devblogs.microsoft @effect/tsgo 0.40 Superset of TypeScript-Go + Effect language service This is what you install for an Effect kit. 50+ Effect diagnostics, quick fixes, layer graph. Do not run it next to plain tsgo. Pins TS 7.0.2 / 7.1-dev and Oxlint 1.79–1.81.⁠Npmjs Knip 6.34 Unused files / exports / deps Complements the linter. Linters don’t see “exported but never imported across the monorepo.” Ships knip-bun. Vercel’s AI SDK swap is the practical proof: ESLint 2m08 + Prettier 1m19 → Ultracite/oxlint/oxfmt 36s.⁠GitHub

Recommended combo for this kit Ultracite └── provider: Oxlint + Oxfmt # lint + format └── --type-aware # oxlint-tsgolint (TS 7) @effect/tsgo # editor LSP + Effect diagnostics typescript@7 (or 5.9 until 7 feels boring) knip # dead code lefthook # git hooks (not husky) Why Oxlint over Biome here:

Effect code lives on Promises/Effect — you want no-floating-promises / no-misused-promises. That’s tsgolint, not Biome. Same TS 7 engine as @effect/tsgo. Versions stay aligned (@effect/tsgo already lists Oxlint 1.79/1.81). Ultracite has React + Bun + TanStack + Vitest presets, plus React Doctor rules (unnecessary effects, hydration). Vite 8 / Rolldown is the same Oxc family. Less toolchain folklore. Use Biome via Ultracite instead if you want one binary and don’t care about typed lint yet. Don’t mix.

Skip ESLint+Prettier unless you need a plugin Oxlint still can’t run. Even then, Oxlint’s jsPlugins can host some ESLint plugins inside Oxlint — you still don’t run eslint as a CLI.

Install (non-interactive, Bun)

# 1. Ultracite wires oxlint + oxfmt + editor + agent files

bunx ultracite@latest init \
--linter oxlint \
--pm bun \
--editors universal \
--type-aware \
--install-skill \
--quiet

# Frameworks it will ask about if you go interactive:

# React, Bun. Add TanStack if you use the Router.

# 2. Type-aware backend (if init didn't already)

bun add -d oxlint oxlint-tsgolint oxfmt ultracite

# 3. Effect language service (replaces plain tsgo in the editor)

bun add -d @effect/tsgo typescript@7 bunx @effect/tsgo setup

# adds plugin "@effect/language-service" to tsconfig

# package.json: "prepare": "effect-tsgo patch"

# 4. Dead code

bun add -d knip lefthook create-better-t-stack already treats Ultracite / Oxlint / Biome as mutually exclusive addons — same decision.

Scripts { "scripts": { "check": "ultracite check && bun run typecheck", "fix": "ultracite fix", "lint": "oxlint --type-aware", "fmt": "oxfmt", "typecheck": "effect-tsgo --noEmit", "knip": "knip-bun", "test": "bun test", "prepare": "effect-tsgo patch && lefthook install" } } ultracite check = oxlint + oxfmt check from the repo root (monorepo-friendly, no per-package ESLint configs).

ultracite fix = auto-fix + format.

Optional: oxlint --type-aware --type-check emits TS diagnostics in the same pass. Fine for CI; in the editor let @effect/tsgo own typecheck so you don’t double-report.

tsconfig (minimum) { "compilerOptions": { "strict": true, "exactOptionalPropertyTypes": true, "noUncheckedIndexedAccess": true, "plugins": [{ "name": "@effect/language-service" }] } } Effect v4 requires strict. TS 7 is what Effect recommends for their tooling. Keep skipLibCheck on until Three.js / R3F types settle.

Editor: workspace TypeScript, not the built-in one.

{ "typescript.tsdk": "./node_modules/typescript/lib", "typescript.enablePromptUseWorkspaceTsdk": true } If you use the TypeScript Native Preview extension, run bunx @effect/tsgo patch so tsgo is effect-tsgo. Running both servers = duplicate diagnostics.⁠Effect-ts-tsgo.mintlify

What each layer catches (don’t collapse them) Layer Catches Misses Oxfmt Style. Tabs, quotes, wrapping. Bugs. Oxlint (syntax) Unused vars, wrong React hooks deps shape, a11y, security, React Compiler rules. Instant. “this Promise is floating.” Oxlint --type-aware no-floating-promises, no-misused-promises, unsafe assignment, thenable mistakes. Effect-specific yield* / Layer mistakes. @effect/tsgo Missing Layer.provide, unused requirements, wrong Schema codecs, unhandled typed errors. Quick fixes. Dead files across workspaces. tsc/effect-tsgo --noEmit The type program is consistent. Style, floating promises unless you also typed-lint. Knip Unused exports, unused deps, orphan files agents leave behind. Logic bugs. Agents generate dead modules constantly. Put knip-bun in CI or they accumulate.

Skills for this DX layer

# Official Ultracite skill (detects provider, check/fix/doctor, code standards)

npx skills add haydenbleasel/ultracite -y

# Official Oxc migrate skills (only if you already have ESLint/Prettier/Biome)

npx skills add oxc-project/oxc --skill migrate-oxlint -y npx skills add oxc-project/oxc --skill migrate-oxfmt -y Ultracite init --install-skill does the first one and also writes agent hooks (Cursor / Claude: format+lint on edit). That’s the deslop mechanism — the model writes, the hook immediately runs ultracite fix, the slop never lands.⁠Docs.ultracite

There is no must-have Knip skill. One line in AGENTS.md is enough:

After adding a file or export, run `bun knip`. Do not leave unused workspace exports. After edits, run `bun fix` (ultracite) before committing. Typecheck with `bun typecheck` (`effect-tsgo --noEmit`), not `tsc` from a global TS 5. Deslop for UI is still frontend-design + web-design-guidelines. Deslop for code shape is Ultracite hooks + Knip. Different jobs.

Lefthook (not Husky)

# lefthook.yml

pre-commit: parallel: true commands: fix: glob: "*.{ts,tsx,js,jsx,json,css}" run: bunx ultracite fix {staged_files} types: run: bun typecheck Ultracite init can wire Lefthook/Husky/lint-staged for you. Lefthook is the 2026 default in Bun monorepos.

Conflicts to document in AGENTS.md One provider. If biome.json and oxlint.config.ts both exist, delete one. One TS server. @effect/tsgo or stock tsgo, never both. Don’t run Prettier. Oxfmt owns format. Disable format-on-save from other tools. Don’t typecheck with Bun’s bun build as a substitute. Use effect-tsgo --noEmit. R3F / Three files: keep useFrame allocations as lint exceptions in packages/game if a rule fights the hot loop; don’t weaken the whole repo. Pin versions together: oxlint@1.81, oxlint-tsgolint@7.0.2001, @effect/tsgo@0.40, typescript@7.0.2. @effect/tsgo publishes the supported matrix — follow it. Day-1 vs later Day 1: Ultracite (oxlint+oxfmt) + @effect/tsgo + knip + lefthook + the Ultracite skill + two lines in AGENTS.md.

Later: Knip --production in CI, oxlint --type-check merged into check if Effect-tsgo CI is redundant, React Doctor plugin (Ultracite 7.9 already has it on the Oxlint React preset).

That’s the whole DX spine. Lint/format is Ultracite. Types in the editor are Effect-tsgo. Dead code is Knip. The agent gets one skill (haydenbleasel/ultracite) and your AGENTS.md so it stops inventing an ESLint config on Tuesday.

423 sources also crypto/ethereum development should be enabled in such starter.. i find https://ethskills.com/ to be very relevant

Thought for 46s ⁠GitHub +1

Packages

# app

bun add viem wagmi @tanstack/react-query bun add -d @wagmi/cli

# contracts (system Foundry, not npm)

# curl -L https://foundry.paradigm.xyz | bash && foundryup

# forge init packages/contracts

packages/chain is the boundary Effect actually owns:

branded Address / Hex / Wei via Effect Schema (Schema.TemplateLiteral("0x${string}") plus checksum refine) Evm.layer that constructs a viem public client from Config (RPC URL redacted) reads return Schema-decoded values, not raw bigint leaking into React writes from the browser go through wagmi; the server never holds a user key Same rule as the rest of the kit: Effect Schema is the app contract. The onchain contract is the ABI. Don’t Zod the chain.

Day-1 scripts { "scripts": { "chain": "anvil", "contracts:build": "forge build --root packages/contracts", "contracts:test": "forge test --root packages/contracts -vvv", "contracts:gen": "wagmi generate" } } wagmi generate from Foundry artifacts into packages/chain/src/generated.ts. That file is generated. Don’t edit it.

Wallet UX (steal from ETHSkills frontend-ux, implement in shadcn) Four button states, always:

Connect Switch network Approve (if ERC-20) Execute → pending → receipt Disable the button until the receipt. Show formatUnits + a USD hint. Never raw wei. Never fire the tx twice on double-click.

EIP-6963 multi-injected wallets via wagmi connectors. Optional later: Porto (wevm smart accounts) or Sign in with Base. Not day-1.

Skills pack (small)

# knowledge (stale-data fix) — required

npx skills add austintgriffith/ethskills -y

# TS client patterns

npx skills add 0xSardius/onchain-typescript-skills -y

# Solidity / OZ

npx skills add OpenZeppelin/openzeppelin-skills --skill setup-solidity-contracts --skill develop-secure-contracts -y

# only if Base is the default L2

npx skills add base/skills --skill build-on-base -y Useful MCP for reads (not a skill): Blockscout https://mcp.blockscout.com/mcp.

Skip:

create-eth@latest / SE2 as the app 95-protocol “cryptoskills” dumps Uniswap/Aave/Chainlink packs until you actually integrate them ethers-era wallet skills If you add swaps later: npx skills add Uniswap/uniswap-ai. If you add feeds: npx skills add smartcontractkit/chainlink-agent-skills.

kit-chain skill (write this yourself) Catalogs won’t encode your two-runtime rule.

.agents/skills/kit-chain/SKILL.md Hard rules:

Fetch https://ethskills.com/SKILL.md before Solidity or deploy. Addresses come from ethskills.com/addresses or a verified explorer — never from memory. packages/contracts is Foundry. Tests are forge test (unit + fuzz + fork). Browser: wagmi. Server: viem inside Effect Layers. No private keys in apps/web. Generated ABIs only via wagmi generate. Effect Schema brands at the app boundary. formatUnits at the UI boundary. Anvil + Base Sepolia until CROPS + security + audit skills have been run. Mainnet is a gate, not a default. Don’t Effect.gen inside wagmi hooks or useFrame. x402 / ERC-8004 are optional later (agent payments / agent identity), not the lobby protocol. Security defaults for AGENTS.md

## Onchain

- Fetch https://ethskills.com/SKILL.md first.
- No user private keys in the client or in git. Server signers via Effect Config, redacted.
- No window.ethereum-only. EIP-6963 via wagmi.
- No hardcoded mainnet addresses. Use packages/chain + generated files.
- forge test must pass before any deploy script runs.
- Day-1 target: Anvil + Base Sepolia. Mainnet requires security + audit skills. What this is not This does not make the starter a DEX. It makes the starter Ethereum-capable: a Foundry package, a typed viem/wagmi boundary, and an agent that reads live ETHSkills instead of inventing Uniswap V2 routers.

x402 is the interesting later piece for this kit specifically — it’s how agents pay other agents onchain. Add @x402/* only when you have a real payment surface. Same for ERC-8004 (agent identity).

If you want this next in the repo: packages/contracts Foundry skeleton, packages/chain Effect+viem client, wagmi provider in apps/web, kit-chain skill, and the ETHSkills pointer in AGENTS.md.

186 sources also crypto/ethereum development should be enabled in such starter.. i find https://ethskills.com/ to be very relevant

Thought for 18s Already in the plan. Short version so it doesn’t get lost in the last writeup.

ETHSkills is the knowledge layer, not the app framework. The kit stays Vite + Effect + shadcn. Foundry + viem + wagmi live in side packages.

npx skills add austintgriffith/ethskills -y npx skills add 0xSardius/onchain-typescript-skills -y npx skills add OpenZeppelin/openzeppelin-skills --skill setup-solidity-contracts --skill develop-secure-contracts -y AGENTS.md:

Before Solidity or shipping onchain, fetch https://ethskills.com/SKILL.md and follow it. Say "onchain", not "on-chain". Workspace:

packages/contracts/ Foundry + OZ packages/chain/ viem + Effect Schema brands + generated ABIs apps/web wagmi + EIP-6963 + shadcn connect apps/server Effect + viem (no user keys) Default nets: Anvil locally, Base Sepolia publicly. Mainnet is a gate after security + audit skills.

Do not run create-eth / Scaffold-ETH 2 inside this repo — that replaces the shell with Next.js.

I can scaffold that workspace next (forge init, Effect Evm layer, wagmi provider, kit-chain skill). Say the word.

25 sources

Bun ThreeJS Real-time Starter Kit Trends - Grok

Bun + Effect + 3D Multiplayer + Web3 — Claude Code Pack One install for shadcn, ultracite, oxc, effect-ts, threejs, rapier, colyseus, ethskills This pack merges 9 production skills for your stack:

UI: shadcn/ui official, ui-polish (Refactoring UI), shadcnblocks, tailwind v4 Lint/Type: ultracite, oxc-toolchain, biome-to-oxc, typescript-pro (tsgo) Backend: effect-ts (22 domains), effect-solutions, bun-workspace-bootstrap 3D: webgpu-threejs-tsl, r3f-skills, r3f-physics Realtime: colyseus-multiplayer, websocket-realtime, multiplayer-architecture Web3: ethskills (20+ skills: ship, security, gas, tools, etc) Quick Install (Claude Code) bash

# 1. Add all marketplaces

/plugin marketplace add shadcn-ui/ui /plugin marketplace add opkod-france/claude-skill-refactoring-ui /plugin marketplace add masonjames/Shadcnblocks-Skill /plugin marketplace add andrueandersoncs/claude-skill-effect-ts /plugin marketplace add austintgriffith/ethskills

# 2. Install core skills

/plugin install shadcn@shadcn-ui-marketplace /plugin install ui-polish@ui-polish-marketplace /plugin install effect-ts@effect-ts /plugin install ethskills@ethskills

# 3. Install oxc + ultracite + 3D + multiplayer (local)

/plugin install ultracite@claude-skills /plugin install oxc-toolchain@local-skills /plugin install webgpu-threejs-tsl@local-skills /plugin install r3f-skills@local-skills /plugin install colyseus-multiplayer@local-skills

# 4. Effect solutions CLI (for agent to fetch live docs)

bun add -g effect-solutions@latest effect-solutions list Alternative: skills.sh (Cursor, Codex, Windsurf compatible) bash pnpm dlx skills add shadcn/ui npx skills add haydenbleasel/ultracite npx skills add dansnow/dotfiles --skill oxc-toolchain biome-to-oxc npx skills add paraddox/webgpu-claude-skill npx skills add pampa2025/r3f-skills npx skills add lambdaak/b-run --skill colyseus-multiplayer npx skills add andginja/ethskills Persistent Setup for Ethskills + Bun + Effect Add to your repo root CLAUDE.md and AGENTS.md:

md

# Stack

Bun 1.3+ fullstack dev server, TypeScript 5.9 erasableSyntaxOnly, Effect 3.14, shadcn v4 Base UI, Three.js r171+ WebGPU/TSL, Rapier, Colyseus authoritative server, Foundry + viem/wagmi

# Before any code

1. For Effect: run `effect-solutions list` and `effect-solutions show <topic>` (services-and-layers, data-modeling, error-handling, testing)
2. For onchain: Read https://ethskills.com/SKILL.md and follow it before writing Solidity or shipping anything onchain. Fetch ship/SKILL.md first — it routes through all other skills.
3. For UI: run `npx shadcn@latest info --json` before adding components
4. For lint/type: Use ultracite check/fix, oxlint --fix, oxfmt --write ., tsgo --noEmit

# Conventions

- Effect.Service (not Context.Tag), Data.TaggedError, Config.redacted, Effect.gen
- Ref<HashMap> for game state, Runtime.runPromise for Bun websocket bridging
- Never use as unknown as ServerWebSocket — define minimal interface
- Tailwind v4 @theme tokens, render prop not asChild
- State is declarative (Colyseus), tick != patch rate Included Skills Reference See marketplace.json for full list with sources. See scripts/install.sh for one-click local install.

What your agent gets Can scaffold: npx create-eth@latest my-3d-game + Bun + Turborepo Can lint: bunx ultracite check / bunx oxlint --fix / tsgo --noEmit Can type: 10x faster with tsgo Can ship: Foundry tests with fork mode, viem + wagmi + RainbowKit Can secure: CROPS review + audit checklist (500+ items)

CLAUDE.md + AGENTS.md template for Bun + Effect + 3D + Web3 Stack Bun 1.3+ fullstack dev server (Bun.serve with HMR, built-in DBs), TypeScript 5.9 with erasableSyntaxOnly + verbatimModuleSyntax, Effect 3.14+, shadcn/ui v4 Base UI (default), Tailwind v4 @theme, Three.js r171+ webgpu + TSL, R3F + drei + Rapier, Colyseus authoritative server, Foundry + viem/wagmi + Scaffold-ETH 2 Bun fork

Global rules Effect first: Before writing Effect code, run effect-solutions list and effect-solutions show <topic>. Use Effect.Service (not Context.Tag), Data.TaggedError, Config.redacted, Effect.gen, Layer.provideMerge Onchain first: Read https://ethskills.com/SKILL.md and follow it before writing Solidity or shipping anything onchain. Fetch ship/SKILL.md first — it routes you through all other skills phase by phase. UI first: Run npx shadcn@latest info --json before adding components. Use base-vega style, render prop not asChild. Base UI 1.6.0 6M+ weekly. Lint/type: ultracite check/fix, oxlint --fix, oxfmt --write ., tsgo --noEmit. Bun does NOT type-check — always run tsc/tsgo separately. Architecture for this starter apps/client: Bun 1.3 fullstack dev server + Vite + R3F, shadcn v4 overlays, WorldSyncController (state-sync + snapshot interpolation), useScaffoldContract for onchain reads apps/server: Effect Platform Bun, Ref<HashMap> for atomic game state, SqliteLive with SqliteMigrator.fromRecord, ViemClient Effect.Service, WebSocket bridged via Effect.runtime packages/contracts: Foundry src/GameItems.sol (ERC-1155), test with forge test --fork-url packages/domain: shared Schema for positions, inputs, snapshots What goes onchain (ethskills rule) Most dApps need 1-2 contracts, not 5-10. Solidity is for: Ownership, Transfers, Commitments. Everything else (player profiles, session state, positions) in Postgres/Bun. Gas ~$0.10 transfer on mainnet now — run cast base-fee before assuming L2 needed. Check contract addresses from ethskills:contract-addresses, never hallucinate.

Multiplayer Server owns truth. Tick 20Hz, patch 20Hz, client 60fps requestAnimationFrame. State is declarative (Schema), not messages. Clients reconcile, don't decide. Positions in Schema, not messages.

Commands bunx ultracite check / fix / doctor bunx oxlint --fix bunx oxfmt --write . tsgo --noEmit forge test -vvv --fork-url $RPC
anvil --fork-url $RPC yarn chain / deploy / start (Scaffold-ETH 2)

{ "description": "Unified Claude Code marketplace for Bun + Effect + shadcn v4 + Tailwind v4 + Three.js WebGPU TSL + R3F + Rapier + Colyseus + ethskills", "name": "bun-effect-3d-web3-pack", "version": "1.0.0", "owner": "kristjan.grm", "plugins": [ { "name": "shadcn", "source": "github:shadcn-ui/ui", "path": "skills/shadcn", "description": "Official shadcn/ui skill - Base UI default, CLI info, Tailwind v4 migration" }, { "name": "ui-polish", "source": "github:opkod-france/claude-skill-refactoring-ui", "description": "Refactoring UI principles with shadcn + Tailwind" }, { "name": "shadcnblocks", "source": "github:masonjames/Shadcnblocks-Skill", "description": "2500+ shadcn blocks" }, { "name": "effect-ts", "source": "github:andrueandersoncs/claude-skill-effect-ts", "description": "22 domains: core, error-management, platform, schema, testing, ai" }, { "name": "effect-solutions", "source": "github:Effect-TS/skills", "description": "Official Effect skills + effect-solutions CLI reference" }, { "name": "ultracite", "source": "github:haydenbleasel/ultracite", "path": "skills/ultracite", "description": "Zero-config linting: Biome | ESLint | Oxlint+Oxfmt" }, { "name": "oxc-toolchain", "source": "github:dansnow/dotfiles", "path": "private_dot_claude/skills/oxc-toolchain", "description": "Set up oxlint + oxfmt" }, { "name": "biome-to-oxc", "source": "github:dansnow/dotfiles", "path": "private_dot_claude/skills/biome-to-oxc", "description": "Migrate Biome to oxlint+oxfmt" }, { "name": "typescript-pro", "source": "github:barbarousrabbit/claude-config", "path": "skills/typescript-pro", "description": "TS 7 Go port tsgo ~10x faster" }, { "name": "webgpu-threejs-tsl", "source": "github:paraddox/webgpu-claude-skill", "path": "skills/webgpu-threejs-tsl", "description": "WebGPU renderer, TSL, node materials, compute shaders" }, { "name": "r3f-skills", "source": "github:pampa2025/r3f-skills", "description": "R3F + drei + postprocessing + rapier" }, { "name": "r3f-physics", "source": "github:solvelab/ai-skills", "path": "claude/skills/r3f-physics", "description": "Rapier RigidBody, colliders, forces" }, { "name": "colyseus-multiplayer", "source": "github:lambdaak/b-run", "path": ".claude/skills/colyseus-multiplayer", "description": "Authoritative server, Schema, tick vs patch" }, { "name": "ethskills", "source": "github:austintgriffith/ethskills", "description": "Ethereum dev: ship, CROPS, gas, wallets, L2s, standards, security, QA, audit - https://ethskills.com" } ], "install": { "scaffold-eth": "npx create-eth@latest", "bun-eth": "github:buidlguidlhawaii/scaffold-eth-2-bun", "foundry": "curl -L https://foundry.paradigm.xyz | bash && foundryup", "effect-solutions": "bun add -g effect-solutions@latest" } }
