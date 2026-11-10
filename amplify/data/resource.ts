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
  // CLI device flow (P0 login). DeviceCode carries no model-level rule, so
  // the schema-level allow.resource(wayfindApiFunction) makes the function
  // its sole accessor. CliToken adds owner read for /app device management.
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
    .secondaryIndexes((index) => [index("codeHash").queryField("deviceCodeByCodeHash")]),

  CliToken: a
    .model({
      tokenHash: a.string().required(), // sha256 of the opaque CLI token
      userId: a.string().required(), // Cognito sub — CLI identity IS the cloud user
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
