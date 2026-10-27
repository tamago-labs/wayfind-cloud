import { defineStorage } from "@aws-amplify/backend";

/** Chat attachments + run artifacts (+ workspace checkpoints in Phase 6). */
export const storage = defineStorage({
  name: "wayfindStorage",
  access: (allow) => ({
    "attachments/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
    ],
    "artifacts/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
    ],
  }),
});
