# Wayfind computer golden image: slim Node + compiled agent server.
# Workspace and secrets are injected per-VM at /run (Phase 2) — the image
# itself carries code + catalog only, never keys.
FROM node:24-alpine

# bun for sandbox JS/TS work (single musl binary, no package manager needed).
COPY --from=oven/bun:alpine /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

RUN apk add --no-cache bash curl python3 make g++

WORKDIR /srv/computer

COPY package.json ./
COPY node_modules ./node_modules
# node-pty ships a Windows/macOS prebuild from the local stage install —
# recompile for this image's arch/libc so the binding always matches.
RUN npm rebuild node-pty --build-from-source && apk del python3 make g++
COPY dist ./dist
COPY workspace ./workspace

ENV PORT=8080
ENV WORKSPACE_DIR=/srv/computer/workspace

EXPOSE 8080

# Phase-1 scaffolding: without keys (injected at /run in Phase 2) the server
# exits via requireApiKey — stay alive so the build can snapshot. Phase 2
# replaces this with a proper /run init gate.
CMD ["sh", "-c", "node dist/server.js || (echo '[computer-image] server needs keys via /run (Phase 2)'; sleep 3600)"]
