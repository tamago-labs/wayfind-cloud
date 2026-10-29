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

## P1 next (not in this scaffold)

handoffs sub-agents · skills loader · MCP stdio client · allow/deny/ask
permissions + approval events · usage events → `POST /runs/:id/usage` ·
doom-loop guard · keystore (`workspace/.wayfind/keys.json`).
