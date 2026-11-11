import { defineFunction, secret } from "@aws-amplify/backend";

export const wayfindApiFunction = defineFunction({
  name: "wayfind-api",
  timeoutSeconds: 300,
  memoryMB: 1024,
  // Deploy-time config (same pattern as the wayfin project): sandbox .env /
  // CI env values are captured here; the handler reads them via `env.X`.
  // Auth pool IDs come from the deploy environment too (visible in the
  // console like everything else) — set them in sandbox .env before deploy.
  // Provider keys use Amplify secrets (never plain env, never stored):
  //   npx ampx sandbox secret set MODAL_API_KEY
  //   npx ampx sandbox secret set PROVIDER_API_KEY
  environment: {
    USER_POOL_ID: process.env.USER_POOL_ID ?? "",
    USER_POOL_CLIENT_ID: process.env.USER_POOL_CLIENT_ID ?? "",
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? "https://wayfind.click",
    COMPUTER_IMAGE_ARN: process.env.COMPUTER_IMAGE_ARN ?? "",
    EXEC_IMAGE_ARN: process.env.EXEC_IMAGE_ARN ?? "",
    // Minimal exec-sandbox image (wayfind-sandbox, P1). Disposable sessions:
    // provisioned per run, never resumed, terminated on idle/expiry.
    COMPUTER_WORKSPACE_BUCKET: process.env.COMPUTER_WORKSPACE_BUCKET ?? "",
    COMPUTER_REGION: process.env.COMPUTER_REGION ?? "ap-southeast-1",
    // Public base of THIS function URL (stable per backend; changes only if
    // the function is recreated). Sent to VMs so usage reports and presigned
    // sync have an API base without the backend knowing its own URL.
    // No trailing slash.
    COMPUTER_API_URL: process.env.COMPUTER_API_URL ?? "",
    MODAL_API_KEY: secret("MODAL_API_KEY"),
    PROVIDER_API_KEY: secret("PROVIDER_API_KEY"),
    // Per-conversation escrow: conversation keys are wrapped with this
    // master key (AES-256-GCM) for history rendering after the VM dies.
    // Unwrapped only for the owner over TLS. Set once:
    //   npx ampx sandbox secret set CONVERSATION_MASTER_KEY  (64 hex chars)
    CONVERSATION_MASTER_KEY: secret("CONVERSATION_MASTER_KEY"),
    // In-VM inference credential (Phase 1 step 4): injected per-boot into
    // the conversation VM via /hooks/run (memory-only, dies with the VM).
    //   npx ampx sandbox secret set NEARAI_CLOUD_API_KEY
    NEARAI_CLOUD_API_KEY: secret("NEARAI_CLOUD_API_KEY"),
    // Shared with the routine-tick sweeper: proves /routines/fire calls
    // come from our own ticker, not the open internet (the Function URL
    // itself is authType NONE). Set once:
    //   npx ampx sandbox secret set TICK_SECRET
    TICK_SECRET: secret("TICK_SECRET"),
  },
});
