import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { wayfindApiFunction } from "../functions/wayfind-api/resource";
import { gatekeeper } from "../functions/gatekeeper/resource";

/**
 * Wayfind Cloud data — Phase 3 (PRD §11).
 * 6 owner-authorized models. Wallet-era models (PriceSnapshot, SavedReview,
 * wallet UserProfile) are removed; there is no publicApiKey access anywhere.
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
      conversations: a.hasMany("Conversation", "botId"),
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
      allow.owner().to(["read"]),
    ])
    .secondaryIndexes((index) => [index("ownerId").queryField("computerByOwnerId")]),

  Conversation: a
    .model({
      ownerId: a.string().required(),
      botId: a.id(),
      bot: a.belongsTo("Bot", "botId"),
      title: a.string(),
      isGroup: a.boolean(),
      participantBotIds: a.string().array(),
      lastMessageAt: a.datetime(),
      messages: a.hasMany("Message", "conversationId"),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("ownerId").queryField("conversationsByOwnerId"),
      index("botId").queryField("conversationsByBotId"),
    ]),

  Message: a
    .model({
      conversationId: a.id().required(),
      conversation: a.belongsTo("Conversation", "conversationId"),
      sender: a.enum(["user", "bot", "system"]),
      botId: a.id(),
      content: a.string(),
      toolActivity: a.json(),
      approvalId: a.id(),
    })
    .authorization((allow) => [
      allow.owner(),
    ])
    .secondaryIndexes((index) => [
      index("conversationId").queryField("messagesByConversationId"),
    ]),

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
