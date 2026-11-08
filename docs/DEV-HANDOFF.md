# Wayfind Cloud — Dev Handoff Notes

Purpose: everything we currently **know**, can **cover in the near
phases**, and openly **don't know yet** — in one file a dev can work from
without reading chat history. Product truth and phase gates live in
`docs/PRD.md` (v7). This file is the engineering companion: update it as
facts land (especially M1 spike results), and tick items off here.

Last updated: 2026-11-02 · Companion to PRD v7
**AWS Lambda / MicroVM provisioning runs live in `ap-southeast-1`** (owner's
account `057386374967`): golden image `wayfind-computer`, provision/suspend/
resume/terminate + workspace sync all exercised against real MicroVMs — see §8.

---

## 1. What exists today (verified in code, 2026-10-27)

- **Auth (deployed):** Cognito email + Google
  (`amplify/auth/resource.ts`). Google `callbackUrls`/`logoutUrls` are
  **localhost-only** — production Google sign-in breaks until real domain
  URLs are added. Known, owner to fix at domain time.
- **Data (deployed):** 4 models in `amplify/data/resource.ts` —
  `UserProfile` (plan enum `free|starter|premium|enterprise`,
  `displayName`), `Bot` (`name/role/description/color/shape/status`),
  `Computer` (provision lifecycle + `usageToken` for VM server-to-server
  auth), `CreditLedger` (metered deltas + running balance). No
  `Conversation`/`Message`/`Skill`/`Run`/`Approval` models — history lives
  in the VM workspace file, approvals park in VM memory. Owner auth per
  model + schema-level function access.
- **App (deployed):** single-page shell (`app/app/page.tsx` →
  `components/app/AppShell.tsx`): DB roster (create/edit/delete Bots),
  chat UI (SSE local, pollable-events relay in cloud), approval/question/
  bot-request cards, BotPanel with real `TabLibrary.tsx` (workspace files;
  system files hidden) and still-stub `TabComputer.tsx`.
- **Functions (deployed):** `wayfind-api` (Function URL, Cognito JWT
  verified in handler; routes `/health /me /bots /computer/request
  /chat/message→501`), `gatekeeper` (Computer gate decisions).
  2026-11-01: gatekeeper REMOVED — no approval gate, any signed-in user may
  provision; routes `/computer/provision` + `/computer/action` live in
  `wayfind-api` with MicroVM IAM.
  Frontend currently talks **AppSync directly** for roster CRUD;
  `lib/wayfind-api.ts` exists but is lightly used — do not build a second
  client path; new server-side work goes through `wayfind-api` routes or
  AppSync deliberately, one or the other per feature.

## 2. Known gaps / dishonest surfaces (fix before claiming features)

| # | Gap | Where | Cover in |
|---|---|---|---|
| 1 | Chat is simulated: canned reply + fake tool lines, nothing persisted | `AppShell.tsx` (`SIMULATED_REPLY`, timers), `seed.ts` demo msgs | **Label done (M0)**: amber "Demo chat" banner in `AppShell`. Real fix Phase 4 — persist `Conversation/Message` + real model call |
| 2 | Models "Sync models" only flipped local state | `components/landing/Models.tsx` | **Done (M0)**: table (1 included + BYOK·soon). Included-model identity/quota still an open PRD decision |
| 3 | Landing stated MicroVM computer as existing fact | `components/landing/HowSection.tsx` | **Done (M0)**: "in development / animated preview" framing until M2 |
| 4 | Pricing tier drift; "Unlimited" unenforced | `components/landing/Pricing.tsx` | **Copy done (M0)**: Starter/Premium/Enterprise-Custom aligned with PRD §4. Enforcement stays a billing-phase item |
| 5 | Computer/Backup UI are stubs | `BotPanel/TabComputer.tsx` (still stub), `TabLibrary.tsx` (**real** since 2026-11 — file list, download, system files hidden) | M2 (status/backups), M3 (skills/files in Library) |
| 6 | Google sign-in tab promised in-VM browser login | `HowSection.tsx` SignInScreen | **Done (M0)**: tab deleted, replaced with "Backed up & resumable". Replacement is Connect Apps OAuth, not browser login |

## 3. What we know about Lambda MicroVMs (AWS docs, fetched 2026-10-27)

Source pages: `lambda/latest/dg/microvms-getting-started`,
`microvms-how-it-works`, `lambda-microvms-guide`. Product/API name is
**Lambda MicroVMs** (Firecracker underneath); SDK package is
`@aws-sdk/client-lambda-microvms`, but the **IAM namespace is `lambda:`**
(verified 2026-11-01 via simulate-principal-policy — `lambda-microvms:`
silently never matches; the CLI model of that era lacks the commands).

**Verified facts (safe to build on):**
- Image flow: zip (`Dockerfile` + artifacts) in **S3** + managed base
  image ARN (AL2023, e.g. `arn:aws:lambda:<region>:aws:microvm-image:
  al2023-1`) + **IAM build role** (S3 read + CloudWatch logs) →
  `create-microvm-image`. Lambda runs the Dockerfile, starts the app,
  waits for **`/ready`** (HTTP 200 if enabled), then captures a
  Firecracker snapshot (disk+memory). Build logs:
  `/aws/lambda-microvms/<image-name>`. Images are versioned
  (`ACTIVE`/`INACTIVE`); a `CREATED` state means build succeeded.
- Run: `run-microvm` restores from snapshot, returns `microvmId` +
  endpoint `*.lambda-microvm.<region>.on.aws`. One image → many VMs.
- Access: `create-microvm-auth-token` (expiry + per-port allowlist) →
  header `X-aws-proxy-auth`. All inbound goes through this.
- Lifecycle: `PENDING → RUNNING → SUSPENDING → SUSPENDED → RUNNING →
  TERMINATING → TERMINATED`. `idlePolicy = {autoResumeEnabled,
  maxIdleDurationSeconds, suspendedDurationSeconds}`; explicit
  `suspend-microvm` / `resume-microvm` / `terminate-microvm`.
  **Suspended preserves state and accrues no compute charges.**
- Hooks: `/ready`, `/run`, `/suspend`, `/terminate`. **Anything created
  at build time (IDs, secrets, connections) is shared by every VM from
  that image** — per-Computer identity/secrets must be minted in `/run`.
- Networking: ingress/egress set independently via network connectors at
  run time. Managed connectors exist (docs examples show `ALL_INGRESS`,
  `INTERNET_EGRESS`); custom VPC egress connectors are possible.
- Cost shape (pricing page not yet checked): pay baseline while RUNNING,
  burst to 4× baseline billed as active use, nothing while SUSPENDED.

**Not verified — M1 spike must answer (do not quote until then):**
- Supported **regions** besides `ap-southeast-1` (works end-to-end) and quotas.
- CPU architecture constraints for images (ARM vs x86 — builds work with SDK defaults; constraint unknown).
- Exact per-minute pricing → re-derive the $5 Starter math.
- Suspend/resume **latency** with the slim real image (hello image: ~10s each way; real-image provision end-to-end ~12s+smoke).
- Locked-down connector names/ARNs for minimum ingress + allowlisted
  egress; whether shell/SSH connectors exist and should stay disabled.
- Whether the endpoint suits long streaming responses from the in-VM
  agent — ANSWERED 2026-11-01: **no**. The token proxy 403s
  unauthenticated preflights and honors no query-token, so browsers can
  never talk direct; all cloud traffic relays via
  `wayfind-api /computer/proxy/*` (buffered) with `GET /runs/:id/events`
  polling for progressive rendering.
- Maximum run/suspended durations — ANSWERED 2026-11-01:
  `maximumDurationInSeconds` hard-capped at 28800 (8h, service-validated);
  `suspendedDurationSeconds` measures continuous suspension (resets on
  resume; 7d set ≈ unbounded within the 8h life). A suspend hook returning
  non-200 TERMINATES the VM instead of suspending — the runtime hook path
  must never 500.

## 4. Provisioning checklist (owner/dev-run, separate from this repo)

Following the AWS getting-started — do the toy version first, by hand,
and record every output in §8 of this file:

1. S3 bucket (MicroVM region) for image artifacts, e.g.
   `wayfind-microvm-artifacts-<region>`.
2. IAM **build role** trusting `lambda.amazonaws.com`
   (`sts:AssumeRole`, `sts:TagSession`) with `s3:GetObject` on the
   bucket + CloudWatch Logs write. (+ ECR read only if pulling private
   base layers later.)
3. Hello-world image: minimal Node HTTP server on 8080 + Dockerfile
   (docs example) → zip → S3 → `create-microvm-image` → poll
   `get-microvm-image` until `CREATED` (check CloudWatch on failure).
4. `run-microvm` with managed ingress/egress connectors + an idlePolicy
   (e.g. suspend after 900s idle, suspended window 604800s) → auth token →
   `curl` the endpoint with `X-aws-proxy-auth`.
5. Exercise suspend → resume → terminate; time each transition; note
   state after `suspendedDurationSeconds` expires.
6. Record: region used, image ARN/version, timings, any quota errors,
   and observed cost after 24h of mostly-suspended time.

Only after step 6 do we commit to the real image (§5). Browser is out
of v1 by decision (PRD v7.3) — no Chromium spike needed; the remaining
M1 question is slim-image resume latency vs chat UX.

## 5. Computer image + CLI — repo-owned spec (build after M1)

- `packages/computer/` (monorepo package): `Dockerfile` (slim: Node + CLI on
 the managed base — no browser in v1), `agent/` (HTTP server:
 task in → transcript events/artifacts/approval-requests out),
 `cli/` (the `wayfind` CLI: `chat`, `run`, `skill list|run|save`,
 `backup now|list`, `status`), `hooks/` (`ready/run/suspend/terminate`
 handlers), `workspace/` seed (empty `/workspace` layout + README).
- Identity: minted in `/run` only — per-Computer token (Secrets
  Manager), computerId, ownerId injected by `computer-manager` at
  `run-microvm` time. Nothing per-user baked into the image, ever.
  The included-model key is fetched from Secrets Manager at the same
  time and written into the VM keystore (memory/file, never the image).
- Inference: direct from inside the VM, Claude-Code-style (v7.2, no
  model relay). The CLI calls providers itself using a VM keystore
  (`/workspace/.wayfind/keys`): the included-model key is provisioned
  at `/run` (never baked into the image; rotated server-side), BYOK
  keys are pushed into the keystore through the privileged backend→VM
  channel when the user saves them in settings — never via chat.
- Streaming: browsers cannot reach the VM endpoint (token proxy rejects
  preflights) — all cloud traffic relays via `wayfind-api
  /computer/proxy/*` (Cognito at the API layer, short-lived VM token
  minted server-side; SSE buffered, `GET /runs/:id/events?cursor=n`
  polled ~1/s for progressive rendering).
  `wayfind-api` keeps control plane only: auth, token minting, usage
  ingest (`POST /runs/:id/usage`, dual-auth: user bearer or per-computer
  usage token), presigned sync URLs, approval relay (browser decision →
  VM). Do NOT build a WS relay on Function URLs — they can't do true
  bidirectional WebSocket.
- Metering: VM tools report usage events immediately (per-computer
  `usageToken` from `/hooks/run`, `apiUrl` per `/task`); completions
  report at done; `CreditLedger` rows carry deltas + running balance.
  Images are priced ($0.01); chat tokens report quantities but no rates
  yet, so chat rows are $0.00. Enforceable because users have no shell
  of their own; server-side anomaly flags later, not hard gates now.
- Tools exposed to the model: shell (in-VM), filesystem (`/workspace`),
 skills. Tool activity streams to chat as
  transcript events; consequential actions return an **approval
  request** and block until the user decides (approval state lives
  outside the VM in `Approval`/`Run` data).
- Skills on disk: `/workspace/skills/<name>/SKILL.md` (+ optional
  scripts). SKILL.md front-matter: name, whenToUse, inputs, steps,
  validation, output, approvalBoundaries. The DB `Skill` row points at
  the file; the file is the source of truth inside the Computer.
- Teach: deferred — v1 has no browser, so there is nothing to record.
 Teach returns post-v1 if/when browser lands (then: record the Bot's
 session → "Turn into skill" → compiler drafts SKILL.md + replay
 script → user reviews → test run → approve). Recording a *human*
 demo needs screen streaming: explicitly out of scope.

## 6. Backup & frontend tracking (M2)

As-built 2026-11-02 (subset of this spec — the rest is still spec):
suspend/terminate push the workspace to `computers/<computerId>/workspace/`
via backend-minted presigned URLs (the VM holds no AWS credentials);
resume/run pull missing-only; `.wayfind/` (keystore) NEVER syncs.
No `ComputerBackup` rows, no snapshot list/restore UI, no interval timer
(deferred), no per-user KMS (bucket default encryption only). Keystore
material lives only in VM memory + per-boot `/hooks/run` injection.

Spec (not yet built):

- Store: S3 bucket (versioning on), prefix per Computer:
  `computers/<computerId>/workspace/`. Sync triggers: `/suspend` hook,
  ~15-min timer while RUNNING, manual `wayfind backup now` / UI button.
- Sync writes `ComputerBackup { computerId, s3Prefix/version,
  sizeBytes, trigger: suspend|interval|manual, status, createdAt }`.
- Frontend (turns `TabComputer.tsx` real): computer status chip,
  last-backup line, snapshot list (time · trigger · size), **Restore**
  per snapshot (explicit confirm; restore = re-sync that version into
  `/workspace` on next run/resume + `Run` entry noting it), run history
  (task, duration, computer minutes, model credits).
- Restore must be tested in M2 acceptance: terminate a VM, restore
  from backup on a fresh one, files intact. Keystore material NEVER
  enters backups (excluded from sync); restores re-inject identity +
  secrets per boot via `/hooks/run`.

## 7. Near phases — what "cover" realistically means

| Phase | Covers | Explicitly NOT covered |
|---|---|---|
| M0 honesty + landing | Models table, Trust→Connectors, Enterprise tier, remove Google-sign-in tab/copy, label/park simulated chat, add prod Google callback URLs note | No backend feature work |
| **M0 status: DONE 2026-10-27** (`npm run build` green; `/` 150 kB, `/app` 239 kB). Remaining from M0 scope: prod Google callback URLs still localhost-only in `amplify/auth/resource.ts` — needs the real domain from the owner, code change is 2 lines when known. | | |
| M1 spike | §4 checklist, §8 results table filled, kill/re-scope decision | No product code |
| M2 Computer v1 | Image+CLI (§5), provision/suspend/resume/meter in `wayfind-api` (no separate `computer-manager` Lambda — folded into the existing function), gatekeeper→removed (no approval gate), backup+panel (§6 as-built subset), direct-in-VM inference + relayed transport | Browser (none in v1); Teach (deferred); routines on Computer |
| M3 Skills on the Computer | Skill save/test/approve from CLI sessions, Library tab shows skills/files, routine hooks land | Browser; human-demo recording; takeover UI; group-chat orchestration on Computer |
| Later | Routines targeting the Computer, Connect Apps (OAuth) tokens brokered to CLI as tools, group chats/handoffs, billing enforcement | Scheduled only when the phase above is proven |

Schema additions when their phase starts (not before): `Skill`,
`Run` (M2, with first real chat/Computer work), `ComputerBackup` (M2),
`ConnectedApp` (connectors phase), `MemoryItem`, `Approval`, `Routine`.
Status 2026-11: none added yet — history lives in the VM workspace file,
approvals park in VM memory, skills are files + `Bot.skillsEnabled`;
`Computer` gained lifecycle + `usageToken` fields instead.

Function additions: provision/suspend/resume/meter folded into
`wayfind-api` (no `computer-manager` — re-evaluate only if the handler
outgrows its 300s budget), `bot-worker` only if
non-Computer chat work still needs a long-running Lambda after the
Computer exists (re-evaluate at M2 — the VM may absorb it),
`watcher` (routines/connectors phase). No webhook Lambda; webhooks stay
routes on `wayfind-api`.

## 8. Spike results — fill in during M1 (do not pre-fill)

| Question (§3) | Result | Date |
|---|---|---|
| Region used / available regions | `ap-southeast-1` works end-to-end (create/run/curl/suspend/resume/terminate/delete). Other regions not probed. | 2026-10-29 |
| Image arch | Hello image used SDK defaults (no `cpuConfigurations` set). No browser in v1 — no Chromium question. | 2026-10-29 |
| Cold run / resume latency | Hello-world (tiny snapshot): PENDING→RUNNING **10.6s**; explicit suspend **10.5s**; explicit resume→RUNNING **10.2s**; app answered 200 after resume. Real image: provision end-to-end (boot + hooks + smoke chat) ~12-60s. | 2026-10-29 / 2026-11-01 |
| Max run / suspended durations observed | Service caps now known: `maximumDurationInSeconds` ≤ 28800 (8h, validation-enforced); `suspendedDurationSeconds` = continuous suspension window (resets on resume; 7d set). Suspend-hook non-200 → TERMINATE instead of suspending (observed 2026-11-01: hook 500 from S3 push with no VM creds). | 2026-11-01 |
| Cost: 1h running vs 24h suspended | Not yet — needs a ~24h mostly-suspended observation. | |
| Connector ARNs used (ingress/egress) | Managed defaults work in `ap-southeast-1`: `arn:aws:lambda:ap-southeast-1:aws:network-connector:aws-network-connector:ALL_INGRESS` + `INTERNET_EGRESS`. | 2026-10-29 |
| Quota limits hit | None (single tiny VM at a time; ~15 VMs total, all terminated after tests). Account memory quota for concurrent VMs still unknown. | 2026-11-01 |
| $5-tier math still holds? (Y/N, new numbers) | Too early — needs real-image resume latency + cost numbers. Slim image (no browser) helps. | |
| VM auth + sync without VM credentials | VM holds no AWS creds (`new S3Client({})` → nothing). Solved 2026-11-02 with backend-minted presigned PUT/GET URLs (usage-token auth, 25MB/file cap); VM `sync.ts` does HTTPS transfers. Runtime suspend hook hardened to never 500 on push failure. | 2026-11-02 |
| Usage metering live? | Yes 2026-11-02: tools + completions POST to `/runs/:id/usage` (dual-auth: user bearer or per-computer usage token from `/hooks/run`); `CreditLedger` rows carry deltas + running balance; images priced at $0.01; chat tokens unpriced (no rates yet). | 2026-11-02 |

Provisioning outputs to record here when they exist: artifact bucket,
build role ARN, image name/ARN + version, region, connector ARNs.

Recorded 2026-10-29 (hello-world spike, since cleaned up):
- Account `057386374967`, region `ap-southeast-1`
- Bucket `wayfind-microvm-artifacts-ap-southeast-1`, key `microvm-artifacts/wayfind-hello.zip` (762 bytes)
- Image `arn:aws:lambda:ap-southeast-1:057386374967:microvm-image:wayfind-hello` v1.0 (build: CREATING→CREATED across two 15s polls)
- Test VM `microvm-43ae7eb8-0053-3da7-92cc-872fa43a198d`, endpoint `*.lambda-microvm.ap-southeast-1.on.aws`, terminated + image deleted after
- SDK notes: `GetMicrovmImage`/`DeleteMicrovmImage` require the full ARN (bare name → `ValidationException`); deleted images/terminated VMs 404 on get (treat as done — scripts handle both).

Recorded 2026-10-31 (golden computer image, Phase 1):
- Image `arn:aws:lambda:ap-southeast-1:057386374967:microvm-image:wayfind-computer` v1.0 (build: CREATING→CREATED ~13×15s polls; first build pulls `node:24-alpine`)
- Bundle 21.2 MB zip (`dist/` + prod-only `node_modules` + `workspace/providers.json` catalog; zero keys — zip audited, no `.env`/keystore)
- Pipeline `packages/computer/scripts/image/`: `01-package-upload` (tsc build + `--omit=dev` stage + S3) → `02-create-image` → `03-run-computer` (manual boot + `/run` identity + cloud chat test)
- Server hooks (Phase 2, in-image): `/ready` health, `/hooks/run` (keystore 0600 + env + provider-cache reset + workspace pull), `/hooks/suspend|resume|terminate` (S3 sync under `computers/<computerId>/workspace/`, `.wayfind/` never leaves the VM)

Recorded 2026-11-01 (image rebuild: events endpoint + guard fix):
- Rebuilt same ARN (delete blocked by running VMs → graceful `/hooks/terminate` (S3 push) + `TerminateMicrovm`, then `02-create-image --replace`); still v1.0
- New route `GET /runs/:id/events?cursor=n` → `{events, nextCursor, done}` (pollable twin of `/stream`, same event shapes) for buffered transports
- `grounded_search` added to guard `READ_ONLY` (was ask-parking every web search; matches `websearch` intent)
- Browser→VM direct is structurally impossible: token proxy 403s unauthenticated OPTIONS (no ACAO), honors no query-token — all cloud traffic relays via `wayfind-api /computer/proxy/*`
- Service caps: `maximumDurationInSeconds` ≤ 28800 (8h); `suspendedDurationSeconds: 300` terminated VMs ~5m after suspend — now 604800 (7d)
- Rebuilt again (server appends unrendered images): runs track `generatedImages` via `GuardOpts.onFileSaved`; completion appends relative `/files/view?path=…` markdown for anything the model failed to echo; frontend `normalizeSrc` resolves relative + loopback URLs to the active transport
- Suspend survival (presigned sync, no VM creds): backend mints presigned PUT/GET URLs (`/computer/sync/upload-urls|download-urls`, usage-token auth, 25MB/file cap); VM `sync.ts` rewritten to HTTPS transfers; runtime suspend hook never 500s; `COMPUTER_API_URL` env feeds the VM its API base

Recorded 2026-11-06 (P2P spike S0 → parked; WS-link design parked with it):
- Verdict: HyperDHT laptop↔MicroVM does not establish. Laptop stack OK (local loopback ping/pong 2.5s), VM DHT OK (`bootstrapped:true, selfLookup:true` via HTTP /debug), but laptop `dht.connect` → repeated `PEER_NOT_FOUND`. Root cause at DHT-routing level, out of spike budget.
- Platform gotchas learned: image build snapshots the RUNNING container — boot-time keypairs/sockets freeze stale (identical pubkey across VMs; fix = lazy init post-restore); `udx-native` ships no `linux-arm64-musl` prebuild (fleet is ARM64) — use glibc base (`node:24-slim`) for anything bundling hyperdht.
- WS-link alternative validated on paper (endpoint subprotocols `lambda-microvm[.authentication,.port]` per AWS launching docs) but also parked: product is live, link needs more thought. No link code in repo (reverted); resume here when ready.

## 9. Guardrails (apply to every phase)

- Nothing user-facing claims a feature before an acceptance test passes
  (PRD checkbox rule). Simulated/demo UI must say so on the surface.
- Secrets via Amplify secrets; never env literals,
  never in chat, never in transcripts/logs. Model keys travel per-boot
  via `/hooks/run` into VM memory; the keystore (`.wayfind/`) never
  leaves the VM and never enters backups; connector OAuth tokens
  never enter the VM.
- Approvals are enforced outside the VM/CLI; a Bot cannot approve
  itself, and memory is never a safety boundary.
- One Computer per account is shared by all its Bots — anything on it
  is visible to all of them. Isolation is between accounts only.
- Deploys (frontend + backend + provisioning) are manual by owner/dev.
  Code in this repo is reviewed at the PRD phase gates before deploy.
