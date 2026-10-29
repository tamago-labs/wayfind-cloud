# Wayfind computer agent (P0 scaffold)

Stack A: `@openai/agents` turn loop with opencode-shaped tools, served over
POST + SSE so the browser talks to the VM directly (PRD v7.2).

## Layout

- `src/server.ts`, `src/cli.ts` — entry points (HTTP/SSE runtime, operator CLI)
- `src/core/` — `config.ts`, `guard.ts`, `permissions.ts` (env, approval context, prompt rules)
- `src/agent/` — `agent.ts`, `subagents.ts`, `skills.ts`, `mcp.ts`, `tools/` (builtins, `task`)
- `src/providers/` — `provider.ts`, `providers.ts`, `keystore.ts` (model access + keys)
- `src/runs/` — `runner.ts`, `usage.ts` (run lifecycle + metering)
- `workspace/` — seed: `skills/example/SKILL.md`, `mcp.json`

## Run locally

```powershell
Copy-Item .env.example .env   # fill PROVIDER_API_KEY
npm install
npx tsx src/server.ts         # agent on :8080
npx tsx src/cli.ts status     # check it
npx tsx src/cli.ts run "list the workspace files"
```

## Try the HTTP path (what the browser will use)

```powershell
$run = Invoke-RestMethod -Method Post -Uri http://localhost:8080/task `
  -ContentType 'application/json' -Body '{"text":"list the workspace files"}'
curl.exe -N "http://localhost:8080/stream/$($run.runId)"
```

## P1 (shipped)

handoffs sub-agents (Research, McpSetup) · skills loader (`SKILL.md`
catalog + `skill` tool) · MCP stdio client (workspace/mcp.json, open
input schemas) · allow/deny/ask permissions (`permissions.json`) +
approval events on the stream (CLI prompts inline; server denies for
now) · usage events (log + optional `WAYFIND_API_URL` post) ·
doom-loop guard (3× identical call stops) · keystore
(`workspace/.wayfind/keys.json`, `wayfind keys set|list`, `POST /keys`).

## P2 (shipped)

providers catalog (`providers.json`: baseURL, key source, per-model
context + $/1M) with true per-agent providers (`OpenAIProvider`;
Research runs the `small` entry) · key rotation (keystore arrays,
round-robin) · `task` tool spawning linked child runs, capped at
`MAX_CHILD_RUNS` (default 4, extras queue) · approvals: **v1 default
is permissive** (`PERMISSION_MODE`) — asks auto-allow and log
`{type:'approval', auto:true}` for audit, so nothing hangs; enforcing
mode parks (emits id, `POST /approvals/:id` decides) but needs a
hang-proof resume transport (SDK-native, not yet built) · strict MCP schemas (JSON-Schema→zod converter; stdio +
remote streamable-HTTP servers) · usage events with spend math when
tokens + rates are present (this SDK surface exposes no token counts —
run-level stats until raw provider usage is tapped) · `wayfind models`
(OpenRouter discovery), `skill run|save`, `backup now|list` (local
tarball; S3 sync is M2) · transcript compaction past `COMPACT_AT_CHARS`
(small-model summary + recent tail).

## P3 next (not in this scaffold)

parallel fan-out policy beyond caps (budgets, lane priorities) ·
provider `modelsApiUrl` auto-discovery into the catalog · remote MCP
OAuth · `skill test` runs · S3 backup sync (`/suspend` hook + timer) ·
browser-free Teach alternative (CLI session → SKILL.md compiler).
