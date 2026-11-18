# Wayfind computer golden image: Debian-slim Node + agent server + QA browser stack.
# Workspace and secrets are injected per-VM at /run — the image itself
# carries code + catalog + tooling only, never keys.
#
# Debian (glibc), NOT Alpine: kane-cli's agent runtime (v16-runner) and its
# bundled Node are glibc-linked — musl cannot load them (spiked 2026-11-18:
# silent exit 2 on Alpine even with gcompat/libc6-compat).
FROM node:24-bookworm-slim

# bun for sandbox JS/TS work (musl binary runs fine on glibc).
COPY --from=oven/bun:alpine /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

# Chromium (QA browser for kane-cli) + build toolchain for the node-pty
# rebuild below. Purged after use; chromium stays.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl ca-certificates python3 make g++ chromium \
  && rm -rf /var/lib/apt/lists/*

# kane-cli: browser automation for the QA bot (Ash). allow-scripts lets its
# native packages install their postinstall binaries (bundled node,
# v16-runner). Pinned — golden images must rebuild reproducibly.
RUN npm config set allow-scripts "@testmuai/kane-cli-assurance-linux-arm64,@testmuai/kane-cli-linux-arm64,@testmuai/kane-cli-node-linux-arm64,sharp" --location=user \
  && npm install -g @testmuai/kane-cli@0.10.6 --no-audit --no-fund \
  && kane-cli --version

WORKDIR /srv/computer

COPY package.json ./
COPY node_modules ./node_modules
# node-pty ships a prebuild from the local stage install — recompile for this
# image's arch/libc so the binding always matches.
RUN npm rebuild node-pty --build-from-source \
  && apt-get purge -y python3 make g++ && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
COPY dist ./dist
COPY workspace ./workspace

ENV PORT=8080
ENV WORKSPACE_DIR=/srv/computer/workspace
# Non-standard Chromium location for kane-cli (Debian package name).
ENV KANE_CLI_CHROME_PATH=/usr/bin/chromium

EXPOSE 8080

# Phase-1 scaffolding: without keys (injected at /run in Phase 2) the server
# exits via requireApiKey — stay alive so the build can snapshot. Phase 2
# replaces this with a proper /run init gate.
CMD ["sh", "-c", "node dist/server.js || (echo '[computer-image] server needs keys via /run (Phase 2)'; sleep 3600)"]
