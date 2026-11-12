import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { wayfindApiFunction } from "../functions/wayfind-api/resource";
import { routineTickFunction } from "../jobs/routine-tick/resource";

/**
 * Wayfind Cloud data — Phase 3 (PRD A11).
 * 5 owner-authorized models + 2 function-only CLI-auth models (DeviceCode,
 * CliToken — P0 login; the function is their sole accessor). Wallet-era models (PriceSnapshot, SavedReview,
 * wallet UserProfile) are removed; there is no publicApiKey access anywhere.
 * Chat transcripts live on the agent server (per-Bot conversation scope),
 * NOT in DynamoDB — Conversation/Message were removed to avoid dual-write.
 * (The `Conversation` model added for Wayfind ONE is a different thing:
 * disposable session metadata + checkpoint pointers. No history content
 * ever lands in DynamoDB — transcripts stay in the MicroVM, checkpoints
 * are sealed blobs in S3.)
 * Later phases add: MemoryItem, Approval (Phase 4), ConnectedApp (Phase 5),
 * Skill, Routine, Run (Phase 7).
 */
const schema = a.schema({
  UserProfile: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      email: a.string().required(),
      displayName: a.string(), // profile name the user sets; Bots address them by this
      region: a.string(),
      plan: a.enum(["free", "starter", "premium", "enterprise"]),
      bots: a.hasMany("Bot", "userProfileId"),
      computer: a.hasOne("Computer", "userProfileId"),
    })
    .authorization((allow) => [
      allow.owner().to(["create", "read", "update"]),
    ])
    .secondaryIndexes((index) => [index("ownerId").queryField("profileByOwnerId")]),

  Bot: a
    .model({
      ownerId: a.string().required(),
      userProfileId: a.id(),
      userProfile: a.belongsTo("UserProfile", "userProfileId"),
      name: a.string().required(),
      role: a.string(), // absent = unassigned; AI assigns after first chat, user can edit
      isChiefOfStaff: a.boolean(), // at most one per user (enforced client-side)
      skillsEnabled: a.string().array(), // absent = all installed skills enabled; otherwise an allowlist of skill names
      mcpEnabled: a.string().array(), // absent = all active MCP servers enabled; otherwise an allowlist of server names
      description: a.string(), // the durable "your job is…" brief
      color: a.string(),
      shape: a.string(),
      status: a.enum(["active", "paused"]),
      pinned: a.boolean(),
      section: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [index("ownerId").queryField("botsByOwnerId")]),

  Computer: a
    .model({
      ownerId: a.string().required(),
      userProfileId: a.id(),
      userProfile: a.belongsTo("UserProfile", "userProfileId"),
      gateStatus: a.enum(["pending", "approved", "queued", "rejected"]),
      provisionStatus: a.enum([
        "not_provisioned",
        "provisioning",
        "running",
        "suspended",
        "terminated",
      ]),
      region: a.string(),
      microvmId: a.string(),
      endpoint: a.string(),
      imageVersion: a.string(),
      // Per-computer usage-report token, minted at provision and injected
      // via /hooks/run. The VM reports metered calls with this (server-to-
      // server) since it holds no Cognito identity of its own.
      usageToken: a.string(),
      requestedAt: a.datetime(),
      decidedAt: a.datetime(),
      // ONE outer-computer flow (PLAN-P2): kind discriminates which product
      // owns this row — absent reads as "classic". teamManifestSha /
      // lastTeamSyncAt track S3 team-sync state; outerModel pins the
      // default Meta model for this computer. All nullable so existing
      // classic rows are untouched.
      kind: a.enum(["classic", "one_outer"]),
      teamManifestSha: a.string(),
      lastTeamSyncAt: a.datetime(),
      outerModel: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [index("ownerId").queryField("computerByOwnerId")]),

  CreditLedger: a
    .model({
      ownerId: a.string().required(),
      delta: a.float().required(),
      reason: a.string().required(),
      balanceAfter: a.float(),
      runId: a.id(),
    })
    .authorization((allow) => [
      allow.owner().to(["read"]),
    ])
    .secondaryIndexes((index) => [index("ownerId").queryField("ledgerByOwnerId")]),

  // Sandbox sessions (P1 workstream 2): one row per provisioned disposable
  // microVM. Lets `run` reuse a warm session, powers `status`/`stop`, and
  // gives metering exact wall-clock. Same access shape as Computer.
  SandboxSession: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      sandboxId: a.string().required(), // microvmId
      sessionToken: a.string(), // per-session bearer (same secrecy as usageToken)
      endpoint: a.string(),
      status: a.enum(["active", "terminated"]),
      provisionedAt: a.datetime(),
      lastUsedAt: a.datetime(),
      // ONE nesting link (PLAN-P2): the outer computer that spawned this
      // run; policy pins the run policy (ONE inner runs use
      // "verified_inference"). Nullable — classic sandbox sessions predate it.
      parentComputerId: a.string(),
      policy: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").queryField("sandboxSessionsByOwnerId"),
      index("parentComputerId").queryField("sandboxRunsByComputer"),
    ]),

  // ONE conversations (hybrid-C): one row per disposable execution session.
  // Metadata + checkpoint POINTERS only — no history content. The hot
  // transcript lives in the MicroVM; checkpoints are sealed blobs in S3
  // (opaque to the backend). encryptedKey is the per-conversation key
  // wrapped with the Wayfind-held master key (escrow for history rendering
  // after the VM dies; unwrapped only for the owner over TLS).
  Conversation: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      botId: a.string(), // Bot row id the bundle was built from (optional)
      botBundleHash: a.string(), // sha256 of the deployed bot bundle
      workspaceHash: a.string(), // sha256 of the attached workspace snapshot
      model: a.string().required(), // curated model id (e.g. Qwen/Qwen3.8-27B)
      provider: a.string().required(), // near-ai (curated models only)
      securityLevel: a.enum(["standard", "verified_inference"]),
      status: a.enum(["live", "closed"]),
      sandboxId: a.string(), // microvmId while live
      endpoint: a.string(),
      sessionToken: a.string(), // per-session bearer (same secrecy as usageToken)
      encryptedKey: a.string(), // escrowed conversation key (wrapped, opaque)
      checkpointManifest: a.string().array(), // ["<seq>:<sha256>", ...] hashes only
      receipt: a.json(), // v0 manifest on close (signed when the signing key is configured)
      terminatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").queryField("conversationsByOwnerId"),
    ]),

  // Checkpoint pointers for a Conversation. Content lives in S3
  // (checkpoints/{ownerId}/{conversationId}/{seq}.bin, sealed).
  Checkpoint: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      conversationId: a.string().required(),
      seq: a.integer().required(),
      sha256: a.string().required(),
      blobKey: a.string().required(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("conversationId").sortKeys(["seq"]).queryField("checkpointsByConversation"),
    ]),

  // Per-owner execution policy (Phase 2). Enforced at conversation
  // provision: requests weaker than mandatoryLevel fail closed; models
  // outside allowedModels are rejected; idle TTL is clamped to the cap.
  // Convention: at most one live row per owner (latest wins on read).
  Policy: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      mandatoryLevel: a.enum(["none", "standard", "verified_inference"]),
      allowedModels: a.string().array(), // empty/absent = curated list only
      maxIdleTtlSeconds: a.integer(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").queryField("policiesByOwner"),
    ]),

  // Append-only audit trail (Phase 2). Function-written, owner-readable.
  // No update/delete routes — history is immutable by construction.
  AuditEvent: a
    .model({
      ownerId: a.string().required(), // Cognito sub
      at: a.datetime().required(),
      actor: a.string().required(), // user:<sub> | cli:<tokenId> | system
      action: a.string().required(), // conversation.created|terminated|policy.updated|evidence.exported
      conversationId: a.string(),
      detail: a.string(), // short JSON (ids, hashes, levels — never secrets)
    })
    .authorization((allow) => [
      allow.owner().to(["read"]),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").sortKeys(["at"]).queryField("auditByOwner"),
    ]),

  // Signed sandbox-image trust record (Phase 2, step 2). Published by the
  // image release ceremony (bearer: IMAGE_TRUST_SECRET), readable by any
  // signed-in user. The backend signs the manifest with the receipt key.
  ImageTrust: a
    .model({
      key: a.string().required(), // always "current" (single active record)
      imageArn: a.string().required(),
      imageVersion: a.string(),
      zipSha256: a.string().required(),
      sbomSha256: a.string(),
      builtAt: a.datetime().required(),
      signature: a.json(), // {kid, algo, sig} over the canonical manifest
      publishedBy: a.string(),
      publishedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
    ])
    .secondaryIndexes((index) => [
      index("key").queryField("imageTrustByKey"),
    ]),

  Routine: a
    .model({
      ownerId: a.string().required(),
      botId: a.string(), // nullable in schema for future account scope; required in v1
      name: a.string(),
      prompt: a.string().required(), // the task text the run executes
      kind: a.enum(["once", "cron"]),
      cron: a.string(), // 5-field cron (minute precision) for kind=cron
      runAt: a.datetime(), // one-shot fire time for kind=once
      timezone: a.string(), // IANA, e.g. Asia/Bangkok (cron eval + display)
      status: a.enum(["active", "paused", "done"]),
      nextRunAt: a.datetime(), // indexed due-check; advanced on every fire
      lastRunAt: a.datetime(),
      lastStatus: a.string(),
      runCount: a.integer(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").queryField("routinesByOwnerId"),
      index("status").sortKeys(["nextRunAt"]).queryField("routinesDue"),
    ]),
  // CLI device flow (P0 login). Same access shape as CreditLedger (proven to
  // synth+deploy): function has full access via schema-level
  // allow.resource(wayfindApiFunction); users get owner-scoped read. The
  // function stamps owner=userId at approval so users can only ever see
  // their own single-use, short-lived code rows.
  DeviceCode: a
    .model({
      codeHash: a.string().required(), // sha256 of the user-facing XXXX-XXXX code
      status: a.enum(["pending", "approved", "denied", "expired"]),
      userId: a.string(), // Cognito sub, set at approval
      cliTokenId: a.id(),
      deviceName: a.string(), // reported by the CLI, shown on the approval page
      tokenOnce: a.string(), // minted CLI token plaintext; read+cleared on first poll
      expiresAt: a.datetime(), // ~10 min after creation
    })
    .authorization((allow) => [
      allow.owner().to(["read"]),
    ])
    .secondaryIndexes((index) => [index("codeHash").queryField("deviceCodeByCodeHash")]),

  CliToken: a
    .model({
      tokenHash: a.string().required(), // sha256 of the opaque CLI token
      userId: a.string().required(), // Cognito sub — CLI identity IS the cloud user
      email: a.string(), // snapshot of the Cognito email at approval (display only)
      deviceName: a.string(),
      expiresAt: a.datetime(), // ~90 days; rotation lands in P1
      revokedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner().to(["read"]),
    ])
    .secondaryIndexes((index) => [
      index("tokenHash").queryField("cliTokenByTokenHash"),
      index("userId").queryField("cliTokensByUserId"),
    ]),
}).authorization((allow) => [
  allow.resource(wayfindApiFunction),
  allow.resource(routineTickFunction),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
