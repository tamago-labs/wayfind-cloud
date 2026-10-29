import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { wayfindApiFunction } from "../functions/wayfind-api/resource";
import { gatekeeper } from "../functions/gatekeeper/resource";

/**
 * Wayfind Cloud data — Phase 3 (PRD A11).
 * 5 owner-authorized models. Wallet-era models (PriceSnapshot, SavedReview,
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
      role: a.string().required(),
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
      gateReason: a.string(),
      provisionStatus: a.enum([
        "not_provisioned",
        "provisioning",
        "running",
        "suspended",
        "terminated",
      ]),
      region: a.string(),
      microvmId: a.string(),
      imageVersion: a.string(),
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
}).authorization((allow) => [
  allow.resource(wayfindApiFunction),
  allow.resource(gatekeeper),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
