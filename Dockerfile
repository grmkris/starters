# One process serves the page and the socket on one origin, which is the
# topology the client was written for. Vite builds the page here; the Bun
# server serves apps/web/dist next to /realtime and /health.
FROM oven/bun:1.4

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build

ENV NODE_ENV=production
# Railway injects PORT; the server reads it through Config.number("PORT").
EXPOSE 3001

CMD ["bun", "apps/server/src/index.ts"]
