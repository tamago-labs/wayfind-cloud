import { defineFunction } from "@aws-amplify/backend";

export const wayfindApiFunction = defineFunction({
  name: "wayfind-api",
  timeoutSeconds: 300,
  memoryMB: 1024,
  // Secrets (provider API keys) are added via Amplify secrets in Phase 4,
  // never as env literals. USER_POOL_ID / GATEKEEPER_FUNCTION_NAME are
  // injected in amplify/backend.ts where the resources exist.
  environment: {},
});
