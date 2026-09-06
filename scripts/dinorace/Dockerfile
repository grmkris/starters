FROM oven/bun:1.4.2-debian AS bun
FROM debian:bookworm-slim
ARG BLENDER_VERSION=4.5.3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils libx11-6 libxi6 libxrender1 libxxf86vm1 libxfixes3 libxkbcommon0 libsm6 libgl1 libegl1 libgles2 libgomp1 mesa-utils libgl1-mesa-dri && rm -rf /var/lib/apt/lists/*
RUN curl -fsSLo /tmp/blender.tar.xz https://download.blender.org/release/Blender4.5/blender-${BLENDER_VERSION}-linux-x64.tar.xz \
    && curl -fsSLo /tmp/checksums https://download.blender.org/release/Blender4.5/blender-${BLENDER_VERSION}.sha256 \
    && cd /tmp && grep "blender-${BLENDER_VERSION}-linux-x64.tar.xz" checksums | sed 's@blender-.*-linux-x64.tar.xz@blender.tar.xz@' | sha256sum -c - \
    && tar -xf blender.tar.xz -C /opt && mv /opt/blender-${BLENDER_VERSION}-linux-x64 /opt/blender && rm blender.tar.xz checksums
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN useradd --uid 10001 --create-home worker
WORKDIR /workspace
ENV BLENDER_BIN=/opt/blender/blender DINORACE_JOB_ROOT=/jobs DINORACE_BLENDER_RENDER_DEVICE=cpu
USER worker
ENTRYPOINT ["bun", "apps/server/src/dinorace/generate.ts"]
