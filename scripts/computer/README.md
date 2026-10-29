# Computer agent test kit

Black-box tests for the `computer/` agent server + CLI. Mirrors the
`scripts/microvm/` pattern: numbered steps, shared `config.ts`, structural
PASS/FAIL (shapes, states, files — never model-output quality).

## Prerequisites

1. Agent server running **with a real key** (each step spends a few small
   model calls — use a free model):
   ```powershell
   cd computer
   npx tsx src/server.ts   # :8080, needs PROVIDER_API_KEY in computer/.env
   ```
2. Run from the **repo root** so workspace paths resolve:
   ```powershell
   npx tsx scripts/computer/01-health.ts
   ```

## Run order

| Step | What it proves |
|---|---|
| `01-health` | routes without model: `/ready`, `/status`, `/skills`, `/approvals`, unknown-approval 404 |
| `02-task-text` | minimal round-trip: exact-echo output, chunk events, no approval |
| `03-tools-readonly` | read/list/allow-listed shell; no permission blocks |
| `04-skills` | skill catalog inject + `skill` tool load |
| `05-approval-flow` | write parks with `{type:'approval'}` → approve completes the run; reject fails it. **SKIPs on permissive servers** (v1 default auto-allows); needs `PERMISSION_MODE=enforcing`, which currently hangs on provider idle timeout — SDK-native resume required to make it pass |
| `06-cli-backup` | `backup now` writes one tarball, `backup list` shows it (no server needed; cleans up) |
| `07-subagents` | `task` fan-out (one subagent per file, `toolCalls >= 3`), child failure surfaces as `done`, recursive delegation completes (4-deep cap is code-verified; watch it with `WAYFIND_DEBUG_EVENTS=1`) |

Stop on first FAIL (each script exits non-zero). `05` wipes the
transcript first (stale history makes models redo old writes) and
approves every ask on the approve path; the reject path rejects once.
Server park timeout is `APPROVAL_TIMEOUT_MS` (default 10 min) — set
`APPROVAL_TIMEOUT_MS=120000` for faster test failure. `05` can still
take minutes on a slow model.

## Out of scope

fan-out load, usage-POST (needs deployed backend), `/computer/token`
(needs AWS), semantic grading of answers. Test files (`ping-*.txt`,
`approve-*.txt`) are removed by the scripts; runtime state
(`workspace/.wayfind/`, `conversations.jsonl`) is gitignored.
