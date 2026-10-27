Wayfind Cloud — Product Requirements Document

Status: living document. Single tracker for phases, decisions and acceptance
gates. Update status here as work lands; do not rely on chat history.

Last updated: 2026-10-27 (v6 — REWRITE around the Grok Bot product model)

> **Why v6 exists:** v3–v5 planned Wayfind as a dashboard product
> (stats, approvals page, ledger page, morning-brief page). The owner
> corrected this: the product is **like Grok Bot** — a list of Bots you
> message, on one shared cloud computer. This PRD is rewritten around that
> model. Sources studied 2026-10-27: `cursor.com/docs/grok-bot`
> (+ get-started / work / use-cases) and `docs.x.ai/overview`.

---

## 1. Product in one line

Wayfind Cloud is **Grok Bot as a standalone product**: named AI Bots with
jobs, memory and faces (our Finder mascots), that you **message like a
teammate**, working on **one cloud computer per account** — available
outside the US-first regions and from $5/month, instead of bundled into a
Cursor/SuperGrok subscription.

## 2. The Grok Bot model (what we are mirroring, verified from the docs)

1. **Bots are the product.** A Bot has a name, an avatar (shape/colour —
   ours: Finder mascots), **one primary job**, and context that compounds.
   You create it in seconds (`New Bot +` → name → Create), then give it its
   job **in its first message** ("Your job is… Never… Remember this.").
2. **Messaging is the interface.** You work by chatting: give a task, the
   context, and the finish line. The transcript shows messages, tool
   activity, computer use, files, questions and **approval requests inline**.
   A direct message redirects work in progress; "Stop now" stops it.
3. **One computer per account, shared by all Bots.** Persistent cloud
   computer with browser, filesystem, terminal. Files, browser sessions
   and logins are shared across your Bots (that is what makes handoffs
   work); **isolation between accounts is strict**. Each Bot gets its own
   screen, so Bots work in parallel. Work continues with your laptop closed.
4. **Connect apps are account-wide.** Gmail, Notion, Slack etc. connect
   once, are available to every Bot, and OAuth tokens live on the
   connector backend — **the Bot never receives the tokens**. Connected
   apps beat browser clicking where they exist; the browser/computer
   covers everything else.
5. **Memory compounds, per Bot.** Stable preferences, role context and
   summaries of prior work persist per Bot; shared files/sessions move
   context between Bots. Memory is corrected by messaging ("Lasting rule:
   from now on…").
6. **Skills and routines.** A *skill* is a saved, reusable way of doing a
   task (steps, decision rules, output format, approval boundaries),
   created from a finished task or taught by demonstration. A *routine*
   runs a skill/workflow on a **schedule or event** (e.g. Slack message,
   GitHub notification, webhook). Path: task → make reliable → save skill
   → test → routine. Routines have run history, pause/resume.
7. **Group chats and handoffs.** Group chats hold 2–6 Bots around one
   outcome with `@mentions` and one owner per stage. Bots can also hand
   work to each other asynchronously and reply later — you watch the
   handoff in the conversation instead of routing between tools yourself.
8. **Approvals and secrets, in the flow.** Before a Bot changes external
   systems it asks (approval prompts / auto-review). Credentials go
   through Vault/secure forms — never pasted into chat, never seen by the
   Bot. Sensitive steps (SSO, passkey, CAPTCHA) hand the computer to you;
   you finish the step and return control. Sessions persist.
9. **Bot details page.** Name/avatar/job edited via the Bot's details:
   About/description, memory, skills, routines (list + run history).
   Roster organisation: pin, sections (group by project/client), hide,
   duplicate, share a Bot template link, delete.
10. **Roles that work (from use-cases):** sales outbound, talent scout,
    paid media, expense manager, product performance, bug reproduction,
    account health, chief of staff. Pattern per role: connect sources →
    one scoped task with a finish line → reviewable output → approval for
    anything external → nightly/weekly routine once reliable.

**Access/pricing facts (docs, 2026-10-27):** Grok Bot is included with
paid Cursor plans, or via linked SuperGrok / Grok Business seats. It is
not sold standalone. Desktop (macOS/Windows/Linux) + mobile (iOS/Android)
apps reach the same Bots and computer.

## 3. Wayfind's wedge (why we exist next to Grok Bot)

- **Standalone, from $5/mo** (free in early access) — not bundled into a
  $20–$300 Cursor/SuperGrok subscription.
- **Region-available** — for indie operators outside the US-first launch
  regions of the big platforms (our backend starts `ap-southeast-1`).
- **Faces you hire:** Finder mascots (Amber/Moss/Lagoon/Ash, §9) make the
  roster ownable and recognisable at a glance — our visual answer to
  Grok Bot's shape/colour avatars.
- **Our computer runs on AWS Lambda MicroVMs** (Firecracker, §8) — one
  per account, suspend-on-idle, so the $5 tier is arithmetically possible.
- **Same trust rules:** approvals before anything irreversible, secrets
  never in chat, audit trail for every action.

Non-goals v1: native desktop/mobile apps (web app first, mobile web
usable), teams/enterprise (SSO, admin policy), computer-use takeover UI,
teach-by-demonstration, public Bot template marketplace.

## 4. Target user and pricing

- Solo founder, indie hacker, creator-operator, 1–10 person team; already
  pays for chat AI but gets no finished work from it.
- Planned tiers (not for sale yet; free in early access, no card):
  - **Starter $5/mo:** 1 Bot, 1 routine, daily brief routine included,
    capped computer minutes + model credits.
  - **Operator $10/mo:** up to 5 Bots, group chats, all beta connectors,
    scheduled + event routines, BYOK (later).
  - **Studio $20/mo:** up to 15 Bots, multiple sections/projects, shared
    Team-Bot style bots, priority capacity.
- Pay for active Bot work + active computer minutes. A suspended computer
  costs nothing; never charge for idle.

## 5. Product concepts (v6 vocabulary — use these words in UI and code)

| Concept | Meaning |
|---|---|
| **Bot / Finder** | A named teammate: avatar (Finder mascot), one primary job, own memory + conversations. Data: `Bot` |
| **Computer** | The account's one cloud computer (MicroVM sandbox), shared by all Bots: files, browser, terminal, logins. Data: `Computer` |
| **Chat** | A conversation with one Bot (or a group). Messages + tool activity + approval cards + files, in one transcript. Data: `Conversation`, `Message` |
| **Connect app** | An account-wide connected service (Gmail, Slack…). Tokens on our backend, never in the computer/chat. Data: `ConnectedApp` |
| **Memory** | Per-Bot durable facts/preferences/summaries; edited by messaging. Data: `Bot.memory` + `MemoryItem` |
| **Skill** | Saved reusable method: when to use, inputs, steps, validation, output, approval boundaries. Data: `Skill` |
| **Routine** | A Bot running work on a schedule or event; has run history. Data: `Routine`, `Run` |
| **Approval** | An inline request in chat to do something consequential. Approved/edited/rejected by the user. Data: `Approval` |
| **Gatekeeper** | The check before a Computer is provisioned: verified account, one Computer per account, region/capacity, abuse limits. Data: `ComputerRequest` |
| **Morning brief** | Not a separate product — it is a *default routine + skill* ("Chief of staff") that posts a digest into chat. |

Starter roles (adapted from Grok use-cases to indie operators):
**Chief of Staff** (digest), **Inbox Manager**, **Lead Hunter** (sales
outbound), **Research Watcher**, **Repo Coder** (bug reproduction → PR),
**Account Health** for creators/sellers (later). First four ship as
templates aligned to the four Finders.

## 6. Experience map

### 6.1 Landing (marketing — MeetMotes-pattern, light theme, §9)

Hero (Finder crew + Bot identity card) → **Bots roster** ("meet your
Bots") → **How it works** (Create a Bot → Give it a job → Connect apps as
it asks → Chat, approve, make it a routine) → **One computer** (shared,
persistent, watch it work, suspends when idle) → **Skills & routines** →
**Group chats & handoffs** → Connect apps → Pricing (standalone wedge) →
FAQ → Create my bot (email + first job/bot). Every mock labelled
illustrative; no waitlist copy; paid plans not on sale.

### 6.2 App (the product — bot-list first, NOT a stats dashboard)

```
┌ Bots roster (sidebar) ──┬ Chat (main) ─────────────┬ Computer (panel) ┐
│ [search]        [+ New] │ Bot name · job · details │ status: running/ │
│ Pinned                  │ transcript: messages,    │ suspended        │
│ ▸ Amber — Inbox         │ tool activity, files,    │ screen preview   │
│ ▸ Moss — Leads          │ approval cards inline    │ [watch] [open]   │
│ ▸ Lagoon — Research     │ [ message your Bot… ]    │ files            │
│ Sections (projects)     │                          │                  │
│ Apps · Skills · Routines│                          │                  │
│ Computer · Settings     │                          │                  │
└─────────────────────────┴──────────────────────────┴──────────────────┘
```

Routes:
- `/app` — roster + selected Bot chat (the home; lands on last/first Bot).
- `/app/bots/[id]` — Bot details: About (name, avatar, job), Memory,
  Skills, Routines + run history. (Chat stays one click away.)
- `/app/apps` — Connect apps (account-wide): provider, scopes, status.
- `/app/skills` — skill library (account-wide, enable per Bot).
- `/app/routines` — all routines across Bots: schedule/event, owner Bot,
  last/next run, pause/resume.
- `/app/computer` — the shared Computer: status, storage, sessions,
  suspend/resume, reset (danger), gatekeeper state before provisioning.
- `/app/settings` — account, plan, usage (minutes/credits), danger zone.

Approvals and activity history are **not separate top-level pages** —
approvals live as cards in chat; history is the transcript + routine run
history (+ account audit view under Settings later if needed).

## 7. Model and agent runtime (xAI seam)

- `docs.x.ai` exposes the **Grok API**: OpenAI-compatible Responses API
  (`https://api.x.ai/v1`, e.g. model `grok-4.7`), function calling, web
  search, structured outputs. Wayfind's router treats providers uniformly:
  **xAI Grok as the reference "Grok-class" provider**, plus a cheap model
  for watchers/routine prep, escalation only when a task needs it.
- Existing seam: `amplify/functions/wayfind-api/config/provider.ts`
  (today LongCat, OpenAI-compatible). Phase 4 generalises it into the
  router with per-Run cost logging. Only paid APIs, BYOK later — no pooled
  consumer subscriptions.
- Watchers (RSS/web/app events) are non-LLM pollers; a model wakes only
  on real change or on schedule. That is what makes routines cheap.

## 8. The Computer on Lambda MicroVMs (verified facts)

Sources fetched 2026-10-27: `microvms-getting-started`,
`microvms-how-it-works`, `lambda-microvms-guide`. Product/API is
**Lambda MicroVMs** (Firecracker underneath), CLI `lambda-microvms`.

Verified: image = S3 zip (Dockerfile + artifacts) + managed AL2023 base
image + IAM build role → `create-microvm-image` builds, starts the app,
waits on `/ready`, snapshots disk+memory. `run-microvm` restores near-
instantly with a dedicated HTTPS endpoint; `create-microvm-auth-token`
(per-port, expiring) authenticates via `X-aws-proxy-auth`. Lifecycle
`PENDING→RUNNING→SUSPENDING→SUSPENDED→RUNNING→TERMINATING→TERMINATED`
with `idlePolicy {autoResumeEnabled, maxIdleDurationSeconds,
suspendedDurationSeconds}`; **suspended = no compute charges**. Hooks
`/ready /run /suspend /terminate`; per-instance secrets ONLY in `/run`
(build-time state is shared by every VM from the image). Ingress/egress
via network connectors (managed defaults exist; exact locked-down
connector names confirmed in the spike).

Consequences for our Computer: the in-VM agent is an HTTP server (task in
→ transcript events/artifacts/approval requests out). Orchestration,
approvals, connector tokens and metering live **outside** the VM in
Lambda/AppSync. `/suspend` checkpoints the workspace to S3 so termination
(max duration / suspended expiry — exact limits are spike questions,
like regions vs our `ap-southeast-1` backend, quotas and per-minute
pricing) never loses work. One Computer per account, gated by §5
Gatekeeper. "Always-on" is never promised: it suspends, and resumes fast.

## 9. Brand, mascots, theme (confirmed, shipped)

- Light paper theme (`paper #FAF7F1`, `ink #131316`), brand accents kept
  (`accent #6C5CE7`, `accent2 #00D2A0`), **same "W" in a black box**
  (`components/landing/Header.tsx` Logo), JetBrains Mono micro-labels,
  dark panels for computer/terminal surfaces.
- Finders (owner-supplied, head-only fluffy heads, `public/finders/`):
  **Amber** (Inbox/Chief-of-staff amber), **Moss** (Leads, green),
  **Lagoon** (Research, teal), **Ash** (Repo, grey). Canonical data:
  `components/landing/finders.ts`. Ship WebP exports (23–32KB); masters
  are ~3MB PNGs. White bg → circular crops/rings only; Ash is low
  contrast — always with label. New Bots pick a Finder face + name.
- MeetMotes patterns kept: mascot hero, identity card, mono labels,
  illustrative labelling. No NFT/token/trading claims anywhere.

## 10. Connectors (account-wide; order by first Bots created)

Rule: official OAuth/API, event support, approval surface; tokens only on
the connector backend (§11), never in the Computer or chat.

| # | Connector | First Bots | Note |
|---|---|---|---|
| 1 | Slack | all | Chat/approvals can also happen from Slack later; briefs land in Bot chat first |
| 2 | Gmail + Google Calendar | Inbox, Chief of Staff | Gmail push events; calendar for digest/brief |
| 3 | GitHub | Repo Coder | Also proves the Computer end-to-end (issue → draft PR) |
| 4 | Web / RSS / Search (xAI web search tool) | Research, Leads | No OAuth; non-LLM watchers wake the model on change |
| 5 | Google Sheets + Notion | Leads, Research | Where outputs land |
| 6 | Telegram | all (delivery) | Non-US indie operators; second chat surface |

Deferred: WhatsApp (Business API cost/review), LinkedIn (no usable
official API — web enrichment instead), Drive/Docs, Linear, Stripe,
generic webhooks/Zapier (escape hatch after the framework exists).

## 11. Backend spec (Amplify Gen 2 — Phase 4)

Auth: wire existing Cognito email auth (`amplify/auth/resource.ts`) into
`amplify/backend.ts` (today unwired — verified). Replace wallet-era models
and `allow.publicApiKey()` CRUD with owner auth; remove the public
`FunctionUrlAuthType.NONE` wayfind-api URL or put it behind auth; secrets
to Amplify secrets/Secrets Manager (not env literals).

Models (AppSync/DynamoDB):
- `UserProfile`: owner, email, region, plan, createdAt.
- `Computer`: owner (1 per account), status
  (`not_requested|pending|approved|queued|provisioning|running|suspended|terminated`),
  microvmId?, imageVersion?, region, gateReason, requestedAt, decidedAt.
- `Bot`: owner, name, finder (avatar id), job (title), description (the
  durable "your job is…" brief), status, pinned, section?, computerId.
- `Conversation`: owner, botId? (null for group), participantBotIds?,
  title, lastMessageAt. `Message`: conversationId, sender
  (`user|bot|system`), botId?, content, attachments (S3 refs), toolActivity
  (JSON), approvalId?, createdAt.
- `MemoryItem`: botId, kind (`preference|fact|summary|rule`), content,
  source (`chat|system`), updatedAt.
- `ConnectedApp`: owner, provider, scopes, status, vaultRef (encrypted
  token reference only — never raw tokens).
- `Skill`: owner, name, whenToUse, instructions, outputSpec,
  approvalBoundaries, enabledBotIds.
- `Routine`: owner, botId, skillId?, instruction, trigger
  (schedule cron/tz | event source+rule | webhook), status
  (`active|paused`), lastRunAt, nextRunAt.
- `Run`: routineId?/botId, trigger, status, summary, artifacts (S3 refs),
  cost {computerMinutes, modelCredits}, startedAt, endedAt.
- `Approval`: conversationId, messageId?, botId, actionType, payloadSummary,
  status (`pending|approved|edited|rejected`), decidedAt.
- `CreditLedger`: owner, delta, reason, balanceAfter, runId?.

Gatekeeper Lambda on `Computer` request: 1) verified account, 2) no other
active Computer, 3) region capacity flag, 4) abuse heuristics → approved
(provision in Phase 6; before that the Computer shows "approved — opens
with computer rollout") or queued/rejected with a shown reason. Every
decision logged (who/when/rule).

### 11.1 How much we build — inventory (decided 2026-10-27)

**Schema: 12 models total, only 6 in the first backend deploy.**
First deploy (Phase 3): `UserProfile`, `Bot`, `Computer` (gatekeeper
fields embedded — no separate request table), `Conversation`, `Message`,
`CreditLedger`. Added later, one phase at a time: `MemoryItem`,
`Approval` (Phase 4), `ConnectedApp` (Phase 5), `Skill`, `Routine`,
`Run` (Phase 7; `Run` stub arrives Phase 4 for cost logging).
Plus 1 Amplify Storage (S3) bucket: chat attachments + run artifacts
(+ workspace checkpoints in Phase 6). Deletes: wallet-era `UserProfile`,
`SavedReview`, `PriceSnapshot` models and their publicApiKey auth.

**Functions: 2 exist today → 3 in Phase 3, 5 at full build.**
`price-tracker` is retired (old RWA product).

| # | Function | Status | Trigger / API | Timeout |
|---|---|---|---|---|
| 1 | `wayfind-api` | **keep + refactor** | HTTPS Function URL (same pattern as today), Cognito JWT verified in handler | 300s |
| 2 | `bot-worker` | new (Phase 4) | async invoke from `wayfind-api` / Scheduler — **the long-running agent** | 900s (Lambda max) |
| 3 | `gatekeeper` | new (Phase 3) | invoked by `wayfind-api` on Computer request (logic also unit-testable standalone) | 30s |
| 4 | `watcher` | new (Phase 5/7) | fixed schedule `every 15m` (same `schedule:` pattern as price-tracker); non-LLM RSS/web/app-event checks → wakes `bot-worker` only on change | 300s |
| 5 | `computer-manager` | new (Phase 6) | called by `wayfind-api` + a 1-min metering/status poll schedule; MicroVM run/suspend/resume/terminate | 300s |

No separate webhook function: webhooks are routes on `wayfind-api`.
No auth-trigger Lambda: `UserProfile` is created on first authenticated
API call. Each function that touches data gets `allow.resource(...)`
in the schema (the pattern `priceTracker`/`wayfindApiFunction` use today).

### 11.2 The API — same shape as the current `wayfind-api`

Keep the existing pattern exactly: one Lambda + Function URL added in
`backend.ts`, handler typed `APIGatewayProxyEventV2`, routes matched on
`rawPath`, JSON in/out, URL exported via `backend.addOutput` (frontend
already reads `custom.wayfindApi.functionUrl`). Changes: auth switches
from the old wallet API key to verifying the Cognito ID token
(`Authorization: Bearer …`) in the handler; Function URL stays `NONE`
at the AWS layer **only because** every route verifies the JWT itself
(webhook routes verify provider signatures instead); CORS locked to our
domain; secrets via Amplify secrets, not env literals.

Routes (v1):
- `POST /chat/message` {conversationId?, botId, text, attachments?} →
  creates Message + Run, async-invokes `bot-worker`, returns `202 {runId}`.
- `GET /chat/stream?runId=` → **response-streaming** Function URL
  (`awslambda.streamifyResponse`; `lambda-stream` is already a dependency):
  token/tool-activity stream for the open chat. Durability comes from
  Messages written by the worker, not from the stream.
- `POST /runs` {botId, instruction, skillId?} · `GET /runs/:id` ·
  `POST /runs/:id/stop` ("stop now").
- `POST /approvals/:id` {decision: approve|edit|reject, editedPayload?} —
  resumes the waiting worker/Run.
- `POST /computer/request` · `POST /computer/action` {suspend|resume|reset}
  (Phase 6 actions; request works from Phase 3 via `gatekeeper`).
- `POST /routines` / `DELETE /routines/:id` — CRUD side-effects that
  create/delete EventBridge Scheduler entries targeting `bot-worker`.
- `POST /webhooks/slack` · `/webhooks/github` · `/webhooks/stripe` —
  signature-verified, enqueue work, return 200 fast.
- Everything else (Bot CRUD, roster, settings, ledger reads) goes through
  AppSync (`generateClient`) with owner auth — no Lambda needed.

### 11.3 Long-running work — how it survives Lambda's limits

Lambda hard limits shape the design (Function URL streaming also caps at
the function's own timeout, max 15 min; API Gateway would cap at 29s,
which is why we keep the Function-URL pattern):

| Duration | Mechanism |
|---|---|
| Chat turn / task < 15 min | `bot-worker` single invocation (900s), `@openai/agents` loop, writes transcript + `Run` progress as it goes |
| 15 min – ~2 h | Worker checkpoints `Run.state` (Dynamo + S3 artifacts) and **re-invokes itself** with the same `runId` (continuation); user sees one unbroken Run |
| Hours / interactive | The agent loop runs **inside the Computer** (MicroVM, Phase 6) — no Lambda clock at all; Lambdas only start/stop/meter it |
| Scheduled / event | EventBridge Scheduler (routines) + `watcher` (15m polls) + webhooks → all funnel into `bot-worker` |

Approvals pause a Run by saving state and ending the invocation; the
`/approvals/:id` call re-invokes the worker to resume — so a Bot can wait
for a human for days at zero compute cost.

## 12. Phases

### Phase 1 — Landing v3 (re-align to Grok model) — redo of v5 landing
Sections per §6.1 (roster, create→job→connect→chat flow, one Computer,
skills & routines, group chats). Finder faces, light theme, standalone
pricing wedge. Acceptance: build green; copy matches §5 vocabulary; every
CTA → create-my-bot; mocks labelled illustrative.
**Status: DONE 2026-10-27 (pending owner visual review).** Landing rewritten
to §6.1/§5 vocabulary: Bots roster (`#bots`), Create→job→connect→chat flow
(`#how`), messaging + group chat (`#chat`), one Computer (`#computer`),
account-wide connect apps, standalone-wedge pricing, FAQ with "is this
like Grok Bot?". Build green.

### Phase 2 — App shell: Bots home (roster + chat)
`/app` roster + chat pane + computer panel per §6.2; Bot detail, Apps,
Skills, Routines, Computer, Settings shells. Templates/preview data only,
clearly labelled; no fake live work. Acceptance: app feels like Grok Bot's
shape — list of Bots first; landing↔app navigation works; build green.
**Status: DONE 2026-10-27 (pending owner visual review).** v5 dashboard
shell deleted (dashboard/approvals/ledger routes gone). Shipped: roster
sidebar + `New Bot`/search placeholders (`components/app/AppNav.tsx`),
chat home `/app?bot=<id>` with honest preview composer
(`components/app/BotChat.tsx` — sends nothing, runs nothing, says so),
Bot details `/app/bots/[id]` (About/Memory/Skills/Routines/connect apps),
plus `/app/bots`, `/app/apps`, `/app/skills`, `/app/routines`,
`/app/computer` (gatekeeper state), `/app/settings`. Build green:
`/app` 97.7 kB, details SSG per Finder.

### Phase 3 — Amplify backend (owner deploys manually)
Auth wired, owner auth, models + gatekeeper per §11, secrets fixed,
public URL gated. Dashboard→ real data: sign in, create Bot (name +
Finder + job), request Computer, see gate status in `/app/computer`.
Acceptance: signed-in user creates a Bot and sees an honest Computer
request state end-to-end. **Deploy: owner-run only (see Changelog).**
**Status: CODE DONE 2026-10-27 — awaiting owner deploy + acceptance test.**
Shipped locally: auth+storage wired in `amplify/backend.ts`; 6 owner-auth
models (wallet-era models + price-tracker deleted); `gatekeeper` Lambda
(§11 rules, decision logged); `wayfind-api` refactored (Cognito JWT
verified in handler, routes `GET /health`, `GET /me`, `GET|POST /bots`,
`POST /computer/request`, `POST /chat/message` → honest 501 until Phase 4;
old OKX/RWA handler deleted; Function URL stays `NONE` at AWS layer only
because every route verifies JWT/provider signatures itself); frontend
wired (`lib/wayfind-api.ts`, `/app/sign-in` Authenticator with pre-deploy
notice, `/app/bots/new`, Request Computer on `/app/computer` — all fail
honestly until deployed). Verified: `next build` green; Amplify TS files
transpile clean. **Owner acceptance after deploy:** sign up → sign in →
Create Bot → Request Computer → see gatekeeper decision.

### Phase 4 — Chat + model runtime (no Computer yet)
Message a Bot and get real work via Connect apps + tools: xAI Responses
API through the router (§7), streaming transcript with tool activity,
per-Bot memory (read/write), approval cards inline, artifacts (files) in
chat, stop/redirect. Acceptance: one Bot (Inbox or Chief of Staff) does a
real, reviewable task for one user, approvals enforced, costs logged.

### Phase 5 — Connect apps (account-wide)
Framework + Slack, then Gmail/Calendar (order re-checked against Phase 3
Bot picks). OAuth token vault, per-app enable per Bot, event ingestion.
Acceptance: a connected app is usable by every Bot without re-connecting;
tokens never appear in chat or the Computer.

### Phase 6 — The Computer (Lambda MicroVMs)
Spike first (regions/quotas/max duration/arch/pricing recorded here;
hello image → run/suspend/resume/terminate; suspend/resume latency +
cost measured; $5 math re-derived or re-priced). Then: agent image
(browser+filesystem+terminal workspace), S3 checkpoint in `/suspend`,
computer panel (watch/status/files), gatekeeper provisioning, minute
metering → `CreditLedger`. Acceptance: a Repo Coder Bot works an issue
to a draft PR on the Computer, suspends idle, resumes with state.

### Phase 7 — Skills & routines
Save skill from a finished chat task; routines (schedule + Slack/GitHub
event + webhook triggers), test runs, run history, pause/resume; the
default Chief-of-Staff morning-brief routine. Acceptance: one routine
runs unattended for a week and posts reviewable output into chat.

### Phase 8 — Group chats, handoffs, beta hardening
Group chats (2–6 Bots, @mentions, one owner per stage), bot→bot async
handoffs, sections/pin/hide/duplicate in the roster, share-a-Bot template
links, abuse controls (TTL, egress caps) at the gatekeeper, merchant-of-
record billing + credit enforcement, cohort rollout by region.

## 13. Open decisions

- [ ] Owner review: landing v3 + app shell (desktop + mobile) — visual gate.
- [ ] Computer region + MicroVM limits — Phase 6 spike evidence only.
- [ ] First connector beyond Slack — from Phase 3 Bot picks (expected
      Gmail/Calendar).
- [ ] Default model per tier (Grok-class vs cheap) — from Phase 4 costs.
- [ ] Merchant-of-record before Phase 8 (Paddle/Lemon Squeezy class;
      Stripe region permitting).
- [ ] Coordinator as a separate Bot template vs group-chat owner pattern —
      decide at Phase 8 (Grok uses group ownership, no special bot).

## 14. Hard constraints and risks

- One Computer per account is a **cost and handoff feature**, not a
  per-Bot isolation boundary: anything on the Computer is available to
  every Bot of that account. Say so in-product; never put a secret on the
  Computer that another Bot shouldn't use. Isolation is between accounts.
- Never promise a literally always-on computer: MicroVM duration limits
  force S3 checkpoint + relaunch (§8).
- $5 pricing survives only on suspend-on-idle + cheap watchers/model
  routing + minute caps. Metering starts Phase 4, not at billing time.
- Approvals must be enforceable outside the Computer/chat (a Bot must not
  be able to talk past its own gate). Memory is not a safety boundary.
- Grok Bot feature/pricing claims in marketing ("as reported in the docs,
  2026-10-27") — re-verify before any public comparison.

## 15. Changelog

- 2026-10-27 (v6.2): Phase 3 backend code done (see §12 Phase 3 status).
  **OWNER DEPLOY (manual, when ready):** 1) commit + push everything incl.
  `amplify/`, `lib/wayfind-api.ts`, new `app/app/` routes — this is a
  **backend-changing deploy** (`amplify.yml` runs `ampx pipeline-deploy`:
  creates Cognito auth, 6 new DynamoDB tables, storage bucket, gatekeeper;
  **deletes** PriceSnapshot/SavedReview tables and price-tracker — old
  wallet-era data, expected loss). 2) In Amplify console watch the build;
  on success the deployed site gets fresh `amplify_outputs.json` (auth +
  new function URL). 3) Acceptance: sign up at `/app/sign-in`, create a
  Bot at `/app/bots/new`, request a Computer at `/app/computer`. Local dev
  after deploy: run `npx ampx generate outputs --branch main --app-id
  <APP_ID>` (or pull the generated file) to refresh local
  `amplify_outputs.json`. Do NOT run `ampx sandbox` unless you want a
  personal sandbox stack.
- 2026-10-27 (v6.1): Phases 1–2 shipped locally per v6: landing re-aligned
  (bots/chat/computer vocabulary, group-chat + skills/routines sections)
  and the app rebuilt as roster + chat (`/app?bot=`, `/app/bots/[id]`,
  apps/skills/routines/computer/settings); v5 dashboard/approvals/ledger
  routes deleted. `next build` green. Nothing deployed — owner deploys
  manually (see v4/v5 deploy rule below) after visual review.
- 2026-10-27 (v6): **Rewrite.** Owner corrected the product model: like
  Grok Bot — list of Bots you message, one shared Computer, account-wide
  Connect apps, Skills & Routines, group chats — not a stats/approvals/
  ledger dashboard (v5 app shell superseded and being replaced). Added
  Grok model study (§2), xAI/Grok API runtime (§7), v6 vocabulary (§5),
  new app IA (§6.2), backend models (§11) and phases (§12). Mascots,
  light theme, MicroVM facts and manual-deploy rule unchanged.
- 2026-10-27 (v5, superseded): Dashboard-style app shell (dashboard/bots/
  approvals/ledger/settings) + landing. Replaced by v6 Phases 1–2.
- 2026-10-27 (v4/v3): Light MeetMotes-pattern landing; owner-supplied
  Finder mascots; connector proposal; reality check on the old scaffold.
  **Deploy rule (still in force): frontend/backend deploys are manual by
  the owner** — commit incl. untracked `docs/`, `public/finders/`,
  `components/`, `app/app/`, push the Amplify-connected branch
  (`amplify.yml` runs pipeline-deploy + build). Agent does not deploy.
