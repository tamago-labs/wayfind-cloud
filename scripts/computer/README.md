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
| `05-approval-flow` | write parks with `{type:'approval'}` → approve resumes to `done` (+file written); reject terminates without writing. **SKIPs on permissive servers**; needs `PERMISSION_MODE=enforcing`. Interrupt/resume is SDK-native (RunState), so no provider hang |
| `06-cli-backup` | `backup now` writes one tarball, `backup list` shows it (no server needed; cleans up) |
| `06-cli-backup` | `backup now` writes one tarball, `backup list` shows it (no server needed; cleans up) |
| `07-subagents` | `task` fan-out (one subagent per file, `toolCalls >= 3`), child failure surfaces as `done`, recursive delegation completes, `task_id` resume recalls prior child state (4-deep cap is code-verified; watch it with `WAYFIND_DEBUG_EVENTS=1`) |
| `10-question` | model asks the user via the `question` tool; harness answers through `POST /questions/:id`; run resumes with the answer (120s tool-side timeout → "Unanswered") |
| `08-conversation` | per-`conversationId` transcript isolation (no bleed), own-word recall, `/history` matches (wipes nothing; uses stamped test conversations) |
| `09-search` | `webfetch` returns a live page as markdown (keyless); `websearch` answers from Exa when a key exists (`/status.search`), otherwise must say a key is missing gracefully |

Stop on first FAIL (each script exits non-zero). `05` approves every ask on the approve path; the reject path rejects once and asserts the file was never written. Set `APPROVAL_TIMEOUT_MS` is gone — parked runs wait indefinitely for a decision (restart the server to drop them). `05` can still
take minutes on a slow model.

## Out of scope

fan-out load, usage-POST (needs deployed backend), `/computer/token`
(needs AWS), semantic grading of answers. Test files (`ping-*.txt`,
`approve-*.txt`) are removed by the scripts; runtime state
(`workspace/.wayfind/`, `conversations.jsonl`) is gitignored.
