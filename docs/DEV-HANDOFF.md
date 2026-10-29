# Wayfind Cloud — Dev Handoff Notes

Purpose: everything we currently **know**, can **cover in the near
phases**, and openly **don't know yet** — in one file a dev can work from
without reading chat history. Product truth and phase gates live in
`docs/PRD.md` (v7). This file is the engineering companion: update it as
facts land (especially M1 spike results), and tick items off here.

Last updated: 2026-10-29 · Companion to PRD v7
**AWS Lambda / MicroVM provisioning is done separately by the owner/dev.**
Nothing in this repo has been run against a real MicroVM yet.

---

## 1. What exists today (verified in code, 2026-10-27)

- **Auth (deployed):** Cognito email + Google
  (`amplify/auth/resource.ts`). Google `callbackUrls`/`logoutUrls` are
  **localhost-only** — production Google sign-in breaks until real domain
  URLs are added. Known, owner to fix at domain time.
- **Data (deployed):** 6 models in `amplify/data/resource.ts` —
  `UserProfile` (plan enum `free|starter|premium|enterprise`,
  `displayName`), `Bot` (`name/role/description/color/shape/status`),
  `Computer` (gate fields), `Conversation`, `Message`, `CreditLedger`.
  Owner auth per model + schema-level `allow.resource(wayfindApiFunction,
  gatekeeper)` for function access.
- **App (deployed):** single-page shell (`app/app/page.tsx` →
  `components/app/AppShell.tsx`): DB roster (create/edit/delete Bots),
  chat UI, approval cards, BotPanel with stub tabs
  (`TabComputer.tsx`, `TabLibrary.tsx` — placeholders).
- **Functions (deployed):** `wayfind-api` (Function URL, Cognito JWT
  verified in handler; routes `/health /me /bots /computer/request
  /chat/message→501`), `gatekeeper` (Computer gate decisions).
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
| 5 | Computer/Backup UI are stubs | `BotPanel/TabComputer.tsx`, `TabLibrary.tsx` | M2 (status/backups), M3 (skills/files in Library) |
| 6 | Google sign-in tab promised in-VM browser login | `HowSection.tsx` SignInScreen | **Done (M0)**: tab deleted, replaced with "Backed up & resumable". Replacement is Connect Apps OAuth, not browser login |

## 3. What we know about Lambda MicroVMs (AWS docs, fetched 2026-10-27)

Source pages: `lambda/latest/dg/microvms-getting-started`,
`microvms-how-it-works`, `lambda-microvms-guide`. Product/API name is
**Lambda MicroVMs** (Firecracker underneath), CLI namespace
`aws lambda-microvms`.

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
- Supported **regions** (our backend is `ap-southeast-1`) and quotas.
- **Maximum run duration** and maximum suspended duration (design assumes
  a cap exists → S3 checkpoint + relaunch regardless).
- CPU architecture constraints for images/Chromium (ARM vs x86).
- Exact per-minute pricing → re-derive the $5 Starter math.
- Suspend/resume **latency** with a Chromium-sized snapshot.
- Locked-down connector names/ARNs for minimum ingress + allowlisted
  egress; whether shell/SSH connectors exist and should stay disabled.
- Whether the endpoint suits long streaming responses from the in-VM
  agent (chunked/SSE behaviour) — affects CLI event streaming design.

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
   (e.g. suspend after 900s idle, suspended max 300s) → auth token →
   `curl` the endpoint with `X-aws-proxy-auth`.
5. Exercise suspend → resume → terminate; time each transition; note
   state after `suspendedDurationSeconds` expires.
6. Record: region used, image ARN/version, timings, any quota errors,
   and observed cost after 24h of mostly-suspended time.

Only after step 6 do we commit to the real image (§5). If Chromium
can't run or resume latency kills chat UX, M2 re-scopes to
terminal/files first — that decision goes in §8 + PRD changelog.

## 5. Computer image + CLI — repo-owned spec (build after M1)

- `computer/` (new top-level dir): `Dockerfile` (FROM node + python +
  Chromium/Playwright on the managed base), `agent/` (HTTP server:
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
- Streaming: browser opens SSE straight to the VM endpoint with a
  short-lived port-scoped token minted by `wayfind-api`.
  `wayfind-api` keeps control plane only: auth, token minting, usage
  ingest (`POST /runs/:id/usage`), approval relay (browser decision →
  VM). Do NOT build a WS relay on Function URLs — they can't do true
  bidirectional WebSocket.
- Metering: CLI posts usage events after each call; `Run` /
  `CreditLedger` rows are written from those events. Enforceable
  because users have no shell of their own; server-side anomaly flags
  later, not hard gates now.
- Tools exposed to the model: shell (in-VM), browser (Playwright),
  filesystem (`/workspace`), skills. Tool activity streams to chat as
  transcript events; consequential actions return an **approval
  request** and block until the user decides (approval state lives
  outside the VM in `Approval`/`Run` data).
- Skills on disk: `/workspace/skills/<name>/SKILL.md` (+ optional
  scripts). SKILL.md front-matter: name, whenToUse, inputs, steps,
  validation, output, approvalBoundaries. The DB `Skill` row points at
  the file; the file is the source of truth inside the Computer.
- Teach v1: agent runs browser tasks under Playwright **trace +
  action log**. "Turn into skill" (chat button on a finished session)
  → compiler drafts SKILL.md + replay script → user reviews →
  test run → approve → skill enabled. Recording a *human* demo needs
  screen streaming: **not v1, do not build**.

## 6. Backup & frontend tracking (M2)

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
  from backup on a fresh one, files intact. Backups contain workspace
  files including the keystore — so backup buckets are encrypted
  per-user (KMS); restores rehydrate keys. Browser profile state only
  if M2 explicitly opts in (default: out).

## 7. Near phases — what "cover" realistically means

| Phase | Covers | Explicitly NOT covered |
|---|---|---|
| M0 honesty + landing | Models table, Trust→Connectors, Enterprise tier, remove Google-sign-in tab/copy, label/park simulated chat, add prod Google callback URLs note | No backend feature work |
| **M0 status: DONE 2026-10-27** (`npm run build` green; `/` 150 kB, `/app` 239 kB). Remaining from M0 scope: prod Google callback URLs still localhost-only in `amplify/auth/resource.ts` — needs the real domain from the owner, code change is 2 lines when known. | | |
| M1 spike | §4 checklist, §8 results table filled, kill/re-scope decision | No product code |
| M2 Computer v1 | Image+CLI (§5), `computer-manager` Lambda (provision/suspend/resume/meter), gatekeeper→provisioning, backup+panel (§6), direct-in-VM inference + SSE transport | Browser *tasks* beyond smoke test; Teach; routines on Computer |
| M3 Browser + Teach | Playwright task tools hardened, session recording → SKILL.md → test/approve, Library tab shows skills/files | Human-demo recording; takeover UI; group-chat orchestration on Computer |
| Later | Routines targeting the Computer, Connect Apps (OAuth) tokens brokered to CLI as tools, group chats/handoffs, billing enforcement | Scheduled only when the phase above is proven |

Schema additions when their phase starts (not before): `Skill`,
`Run` (M2, with first real chat/Computer work), `ComputerBackup` (M2),
`ConnectedApp` (connectors phase), `MemoryItem`, `Approval`, `Routine`.

Function additions: `computer-manager` (M2), `bot-worker` only if
non-Computer chat work still needs a long-running Lambda after the
Computer exists (re-evaluate at M2 — the VM may absorb it),
`watcher` (routines/connectors phase). No webhook Lambda; webhooks stay
routes on `wayfind-api`.

## 8. Spike results — fill in during M1 (do not pre-fill)

| Question (§3) | Result | Date |
|---|---|---|
| Region used / available regions | `ap-southeast-1` works end-to-end (create/run/curl/suspend/resume/terminate/delete). Other regions not probed. | 2026-10-29 |
| Image arch (Chromium ok?) | Not yet — hello image used SDK defaults (no `cpuConfigurations` set). Arch + Chromium still open. | 2026-10-29 |
| Cold run / resume latency | Hello-world (tiny snapshot): PENDING→RUNNING **10.6s**; explicit suspend **10.5s**; explicit resume→RUNNING **10.2s**; app answered 200 after resume. Chromium-sized snapshot will be slower — re-measure on the real image. | 2026-10-29 |
| Max run / suspended durations observed | Not hit: test VM capped at `maximumDurationInSeconds: 14400` (4h), `suspendedDurationSeconds: 300` expiry not observed. | 2026-10-29 |
| Cost: 1h running vs 24h suspended | Not yet — needs a ~24h mostly-suspended observation. | |
| Connector ARNs used (ingress/egress) | Managed defaults work in `ap-southeast-1`: `arn:aws:lambda:ap-southeast-1:aws:network-connector:aws-network-connector:ALL_INGRESS` + `INTERNET_EGRESS`. | 2026-10-29 |
| Quota limits hit | None (single tiny VM). Account memory quota for concurrent VMs still unknown. | 2026-10-29 |
| $5-tier math still holds? (Y/N, new numbers) | Too early — needs Chromium-image resume latency + real cost numbers. | |

Provisioning outputs to record here when they exist: artifact bucket,
build role ARN, image name/ARN + version, region, connector ARNs.

Recorded 2026-10-29 (hello-world spike, since cleaned up):
- Account `057386374967`, region `ap-southeast-1`
- Bucket `wayfind-microvm-artifacts-ap-southeast-1`, key `microvm-artifacts/wayfind-hello.zip` (762 bytes)
- Image `arn:aws:lambda:ap-southeast-1:057386374967:microvm-image:wayfind-hello` v1.0 (build: CREATING→CREATED across two 15s polls)
- Test VM `microvm-43ae7eb8-0053-3da7-92cc-872fa43a198d`, endpoint `*.lambda-microvm.ap-southeast-1.on.aws`, terminated + image deleted after
- SDK notes: `GetMicrovmImage`/`DeleteMicrovmImage` require the full ARN (bare name → `ValidationException`); deleted images/terminated VMs 404 on get (treat as done — scripts handle both).

## 9. Guardrails (apply to every phase)

- Nothing user-facing claims a feature before an acceptance test passes
  (PRD checkbox rule). Simulated/demo UI must say so on the surface.
- Secrets via Amplify secrets/Secrets Manager; never env literals,
 never in chat, never in transcripts/logs. Model keys live only in
 the VM keystore + per-user-encrypted backups; connector OAuth tokens
 never enter the VM.
- Approvals are enforced outside the VM/CLI; a Bot cannot approve
  itself, and memory is never a safety boundary.
- One Computer per account is shared by all its Bots — anything on it
  is visible to all of them. Isolation is between accounts only.
- Deploys (frontend + backend + provisioning) are manual by owner/dev.
  Code in this repo is reviewed at the PRD phase gates before deploy.
