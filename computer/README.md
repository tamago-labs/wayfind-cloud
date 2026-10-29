# Wayfind computer agent (P0 scaffold)

Stack A: `@openai/agents` turn loop with opencode-shaped tools, served over
POST + SSE so the browser talks to the VM directly (PRD v7.2).

## Layout

- `src/agent.ts` — triage agent (single env model, P0)
- `src/tools/builtin.ts` — shell/read/write/list (permission gating in P1)
- `src/runner.ts` — background runs, chat-further SSE shapes, JSONL transcript
- `src/server.ts` — HTTP: `/task`, `/stream/:runId`, `/status`, `/ready`, `/hooks/*`
- `src/cli.ts` — `wayfind chat|run|status`
- `workspace/` — seed: `skills/example/SKILL.md`, `mcp.json` (P1 wires both)

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
round-robin) · `task` tool spawning linked child runs (parallel lanes
when the model emits several calls) · pause/resume approvals (server
parks the tool call, emits `{type:'approval', approvalId}`, `POST
/approvals/:id` decides, 10-min timeout → reject; `GET /approvals`
lists pending) · strict MCP schemas (JSON-Schema→zod converter) ·
usage events carry model + cost rates (token counts need raw provider
usage — P3).

## P3 next (not in this scaffold)

parallel fan-out policy caps · token-level spend math · providers
`modelsApiUrl` auto-discovery · remote MCP transports (SSE/streamable
HTTP) · browser tool (Playwright) · backup sync (`/suspend` hook +
timer) · Teach recording → SKILL.md.
